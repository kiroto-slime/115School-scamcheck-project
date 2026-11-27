import { riskLabel, useLanguage } from '../language'
import { checkMessage } from '../checkMessages'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigationType, useParams } from 'react-router-dom'
import { api, ApiError, formatTime, postJson, researchId, type AnalysisResult } from '../api'
import { Alert, RiskBadge, Section, Spinner } from '../components/ui'
import { addHistory, readHistory, resultSummary, type CheckReceipt } from '../history'
import { ResultOpinion } from '../components/ResultOpinion'
import { finalRisk, mainReasons, riskConclusion } from '../../shared/conclusion'
export { mainReasons } from '../../shared/conclusion'

const MATCH_ZH = { exact: '相同內容', similar: '相似內容（不等於同一事件）' }

/** gemini-3.5-flash-lite → Gemini 3.5 Flash Lite；備援模型先去掉 @cf/nvidia/、openai/ 這類前綴 */
const modelName = (id: string) => id.replace(/^@?[^/]*\/(?:[^/]*\/)?/, '').replace(/-it$/, '').replace(/-preview$/, '').replace(/-a\d+b$/, '').split('-').map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')

/** 實際回答的 AI：[完整名稱, 簡稱]（Gemini 失敗時可能改用備援 AI） */
const PROVIDERS: Record<string, [string, string]> = {
  gemini: ['Google Gemini', 'Gemini'], workers_ai: ['Cloudflare Workers AI', 'Workers AI'], groq: ['Groq', 'Groq'],
}
const providerOf = (p?: string | null) => PROVIDERS[p ?? 'gemini'] ?? PROVIDERS.gemini

const HEADLINE: Record<string, [string, string]> = {
  高: [riskConclusion('高'), 'border-red-300 bg-red-50'],
  中: [riskConclusion('中'), 'border-amber-300 bg-amber-50'],
  低: [riskConclusion('低'), 'border-emerald-300 bg-emerald-50'],
  資訊不足: [riskConclusion('資訊不足'), 'border-slate-300 bg-slate-50'],
}

function ConclusionCard({ data }: { data: AnalysisResult }) {
  const { lang, t } = useLanguage()
  const messageText = (value: string) => checkMessage(t, value)
  // 綜合等級：規則、Gemini、網址名單、Cofacts 取最高
  const final = finalRisk(data)
  const [headline, tone] = HEADLINE[final.level] ?? HEADLINE['資訊不足']
  const reasons = mainReasons(data)
  const aiOk = data.ai.status === 'ok'
  // 訊息裡藏有要 AI 改判的指令：規則或 AI 任一方發現就警告
  const manipulated = data.features.some((f) => f.feature_id === 'ai_manipulation') || (aiOk && data.ai.manipulation === true)
  // 有用 Gemini 就一定顯示它的回答（也是匯出的重要參考）
  const aiSummary = aiOk ? data.ai.summary : null
  return (
    <section className={`conclusion-card space-y-4 rounded-2xl border-2 p-4 shadow-sm sm:p-6 ${tone}`} data-risk={final.level} aria-labelledby="conclusion">
      <div className="flex flex-wrap items-center gap-3">
        <RiskBadge level={final.level} />
        {final.sources.length > 0 && <span className="text-sm text-slate-600">{t('依據：', 'Based on: ', '根拠：', '판정 근거: ')}{final.sources.map(messageText).join(t('、', ', ', '、', ', '))}</span>}
      </div>
      <h2 id="conclusion" className="text-xl sm:text-2xl">{messageText(headline)}</h2>
      {manipulated && (
        <Alert kind="error">
          <strong>{t('這則訊息試圖操控 AI 的判斷。', 'This message tries to influence the AI’s judgment.', 'このメッセージはAIの判断を操作しようとしています。', '이 메시지는 AI의 판단을 조작하려 합니다.')}</strong>{t('內容裡藏有要 AI 忽略指示或改判為安全的文字，正常的通知不會這樣寫，這通常是詐騙集團想騙過查核工具。', ' It contains instructions to ignore guidance or mark the message as safe. Genuine notices do not contain such instructions. Scammers often use them to mislead checking tools.', 'AIに指示を無視させたり、安全と判定させたりする文が含まれています。通常の通知にはない表現で、詐欺グループがチェックツールを欺く際によく使います。', ' AI에게 지시를 무시하거나 안전하다고 판단하라는 문구가 숨어 있습니다. 일반적인 안내에는 쓰지 않는 표현으로, 사기 조직이 확인 도구를 속일 때 자주 사용합니다.')}
        </Alert>
      )}
      {aiSummary && <p className="break-words text-slate-700"><span className="font-medium">{t(`${providerOf(data.ai.provider)[1]} 的判斷（`, `${providerOf(data.ai.provider)[1]} assessment (`, `${providerOf(data.ai.provider)[1]}の判断（`, `${providerOf(data.ai.provider)[1]} 판단(`)}{data.ai.risk_level && riskLabel(lang, data.ai.risk_level)}{t('）：', '): ', '）：', '): ')}</span>{aiSummary}</p>}
      {reasons.length > 0 && (
        <div>
          <p className="font-medium">{t('主要原因', 'Main reasons', '主な理由', '주요 이유')}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{reasons.map((r) => <li key={r}>{messageText(r)}</li>)}</ul>
        </div>
      )}
      <div className="conclusion-actions rounded-xl bg-white/70 p-3">
        <p className="font-medium">{t('建議你這樣做', 'What you can do', '推奨する行動', '권장 행동')}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">{data.safe_actions.map((a) => <li key={a}>{messageText(a)}</li>)}</ul>
      </div>
      <p className="text-xs text-slate-500">
        {t('各來源判斷：', 'Assessment by source: ', '各情報源の判断：', '출처별 판단: ')}{final.parts.map((p) => `${messageText(p.name)} ${riskLabel(lang, p.level)}`).join(t('、', ', ', '、', ', '))}{t('。綜合等級取其中最高者，不是詐騙機率，也不是司法認定。', '. The overall level is the highest rating from these sources. It is neither a probability of fraud nor a legal finding.', '。総合評価は各情報源のうち最も高いレベルです。詐欺の確率や司法判断を示すものではありません。', '. 종합 등급은 각 출처의 가장 높은 등급입니다. 사기 확률이나 법적 판단을 뜻하지 않습니다.')}{aiSummary ? t('AI 摘要可能出錯。', ' The AI summary may contain errors.', 'AIの要約に誤りがある場合があります。', ' AI 요약에 오류가 있을 수 있습니다.') : ''}
      </p>
    </section>
  )
}

function AiBlock({ ai }: { ai: AnalysisResult['ai'] }) {
  const { t } = useLanguage()
  const messageText = (value: string) => checkMessage(t, value)
  const vendor = ai.provider === 'gemini' || !ai.provider ? 'Google' : providerOf(ai.provider)[0]
  const model = ai.model ? modelName(ai.model) : providerOf(ai.provider)[1]
  if (ai.status === 'ok')
    return (
      <div className="space-y-2">
        {ai.risk_level && <RiskBadge level={ai.risk_level === '無法判斷' ? '資訊不足' : ai.risk_level} />}
        <p className="break-words">{ai.summary}</p>
        {ai.media_description && <p className="break-words text-sm text-slate-600">{t('AI 看到／聽到的內容：', 'What the AI saw or heard: ', 'AIが画像・音声から読み取った内容：', 'AI가 보고 들은 내용: ')}{ai.media_description}</p>}
        {!!ai.risk_points?.length && (<><p className="font-medium">{t('可疑之處', 'What looks suspicious', '不審な点', '의심스러운 점')}</p><ul className="list-disc space-y-1 pl-5">{ai.risk_points.map((x) => <li key={x}>{x}</li>)}</ul></>)}
        {!!ai.advice?.length && (<><p className="font-medium">{t('AI 建議', 'AI suggestions', 'AIからの提案', 'AI의 제안')}</p><ul className="list-disc space-y-1 pl-5">{ai.advice.map((x) => <li key={x}>{x}</li>)}</ul></>)}
        {ai.fallback_note && <p className="text-xs text-amber-800">{messageText(ai.fallback_note)}</p>}
        <p className="text-xs text-slate-500">{t(`由 ${vendor} ${model} 產生，AI 可能出錯；此判斷不列入下方的規則風險指數。`, `Generated by ${vendor} ${model}. AI can make mistakes. This assessment is separate from the rule-based score below.`, `${vendor} ${model}が生成しました。AIは誤る場合があります。この判断は下のルールに基づくリスク指標には含まれません。`, `${vendor} ${model}의 분석입니다. AI는 틀릴 수 있습니다. 이 판단은 아래 규칙 기반 위험 지수에 포함되지 않습니다.`)}</p>
      </div>
    )
  const statusText = ai.summary && messageText(ai.summary)
  if (ai.status === 'demo') return <Alert kind="warn">{statusText}</Alert>
  if (ai.status === 'error' || ai.status === 'rate_limited') return <Alert kind="error">{statusText} {t('其他分析結果不受影響。', 'The other results are unaffected.', '他の分析結果には影響しません。', '다른 분석 결과에는 영향이 없습니다.')}</Alert>
  return <p className="text-slate-600">{statusText}</p>
}

export default function Result() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigation = useNavigationType()
  // 只在這次送出後顯示。重新整理、回上一頁或從紀錄打開時直接看結果。
  return <>
    <ResultBody />
    {navigation === 'PUSH' && state?.receipt?.analysis_id === id && <ReceiptDialog saved={state.saved} />}
  </>
}

function ReceiptDialog({ saved }: { saved: boolean }) {
  const { t } = useLanguage()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return <dialog ref={ref} className="receipt-dialog card" aria-labelledby="receipt-title" aria-describedby="receipt-description">
    <h2 id="receipt-title">{t('已收到', 'Check received', '受け付けました', '접수했습니다')}</h2>
    <p id="receipt-description" className="my-4 text-slate-700">{saved
      ? t('現在可以關閉這個分頁。稍後用同一個瀏覽器開啟「查核紀錄」，就能查看這筆結果。', 'You can close this tab now. Open Check history in this browser later to see your result.', 'このタブを閉じても大丈夫です。後で同じブラウザーの「確認履歴」から結果を確認できます。', '이제 이 탭을 닫아도 됩니다. 나중에 같은 브라우저의 확인 기록에서 결과를 볼 수 있습니다.')
      : t('這台裝置無法儲存查核紀錄。關閉分頁或查核下一則前，請先將本頁加入書籤，以便回來查看結果。', 'This browser could not save your history. Bookmark this page before closing it or starting another check.', 'この端末では履歴を保存できません。タブを閉じたり次のチェックを始めたりする前に、このページをブックマークしてください。', '이 기기에 기록을 저장할 수 없습니다. 탭을 닫거나 다음 확인을 시작하기 전에 이 페이지를 즐겨찾기에 추가해 주세요.')}</p>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className="btn-secondary" onClick={() => ref.current?.close()}>{t('了解，我已明白', 'Got it', 'わかりました', '알겠습니다')}</button>
      <Link to="/check" className="btn-primary text-center no-underline hover:no-underline">{t('查核下一則', 'Check another message', '次のメッセージを確認', '다음 메시지 확인')}</Link>
    </div>
  </dialog>
}

function ResultBody() {
  const { lang, t } = useLanguage()
  const messageText = (value: string) => checkMessage(t, value)
  const { id } = useParams()
  const loc = useLocation()
  const receipt = loc.state?.receipt as CheckReceipt | undefined
  const [saved] = useState(() => loc.state?.saved ?? readHistory().some(item => item.id === id))
  const [job, setJob] = useState(receipt?.job_status)
  const [data, setData] = useState<AnalysisResult | null>(loc.state?.analysis_id === id ? loc.state : null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fb, setFb] = useState<'idle' | 'sending' | 'helpful' | 'unhelpful' | 'error'>('idle')
  const [fbError, setFbError] = useState('')

  useEffect(() => {
    if (data?.analysis_id === id) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const read = async () => {
      try {
        const value = await api<AnalysisResult | CheckReceipt>(`/api/analysis/${id}`)
        if (!active) return
        if ('job_status' in value) {
          setJob(value.job_status)
          if (value.job_status === 'pending') timer = setTimeout(read, 2500)
        } else { setJob(undefined); setData(value) }
      } catch (e) { if (active) setError(e instanceof ApiError ? e.message : '讀取失敗') }
    }
    void read()
    return () => { active = false; clearTimeout(timer) }
  }, [id, data?.analysis_id, attempt])

  // 看過的結果記到這台裝置的「查核紀錄」（不含原文）
  useEffect(() => {
    if (!data || data.analysis_id !== id) return
    addHistory(resultSummary(data))
  }, [data, id])

  if (error) return <Alert kind="error">{messageText(error)} <button type="button" onClick={() => { setError(null); setAttempt(n => n + 1) }}>{t('重新讀取結果', 'Reload result', '結果を再読み込み', '결과 다시 읽기')}</button></Alert>
  if (job) return <Section title={t('文字查核', 'Text check', 'テキストチェック', '텍스트 확인')}>
    <p role="status">{job === 'failed'
      ? t('這筆查核已中斷，請重新送出。', 'This check was interrupted. Submit it again.', 'チェックが中断しました。再送信してください。', '확인이 중단되었습니다. 다시 보내 주세요.')
      : !saved
        ? t('已收到。這台裝置的紀錄裡還沒有這一筆，請先收藏本頁網址。', 'Received. This check is missing from this browser’s history. Bookmark this page.', '受け付けました。この端末の履歴にないため、このページをブックマークしてください。', '접수했습니다. 이 기기의 기록에 없어 이 주소를 즐겨찾기에 추가해 주세요.')
        : t('正在查核，完成後會自動顯示結果。', 'Your check is in progress. The result will appear here automatically.', 'チェック中です。完了すると結果が自動で表示されます。', '확인 중입니다. 완료되면 결과가 자동으로 표시됩니다.')}</p>
    <div className="flex flex-wrap gap-2"><Link className="btn-primary" to="/check">{t('再查一則', 'Check another message', '別のメッセージを確認', '다른 메시지 확인')}</Link>
    <Link className="btn-secondary" to="/history">{t('查核紀錄', 'Check history', '確認履歴', '확인 기록')}</Link></div>
  </Section>
  if (!data) return <Spinner label={t('載入結果中…', 'Loading results…', '結果を読み込んでいます…', '결과를 불러오는 중…')} />

  const sendFeedback = async (helpful: boolean) => {
    if (fb !== 'idle' && fb !== 'error') return
    setFb('sending')
    try {
      const rid = researchId.get()
      await postJson('/api/feedback', { analysis_id: data.analysis_id, helpful, ...(rid && data.consent_research ? { research_id: rid } : {}) })
      setFb(helpful ? 'helpful' : 'unhelpful')
    } catch (e) {
      setFbError(e instanceof ApiError ? e.message : '')
      setFb('error')
    }
  }

  const separator = t('、', ', ', '、', ', ')
  const colon = t('：', ': ', '：', ': ')
  const c = data.cofacts
  const u = data.url_checks
  const fc = data.fact_check
  return (
    <div className="space-y-4">
      <h1>{t('查核結果', 'Check results', 'チェック結果', '확인 결과')}</h1>
      <ConclusionCard data={data} />
      {data.media?.notes?.map((n) => <Alert key={n} kind="info">{messageText(n)}</Alert>)}
      {data.extracted_text_preview && (
        <details className="card">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">{t('查看自動辨識出的文字（只顯示於本次，不會保存）', 'View automatically recognized text (shown this time only and never saved)', '自動認識したテキストを表示（今回のみ表示し、保存しません）', '자동 인식한 텍스트 보기(이번에만 표시되며 저장되지 않음)')}</summary>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{data.extracted_text_preview}</p>
        </details>
      )}

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 font-medium text-slate-800 hover:bg-slate-50 sm:px-6 [&::-webkit-details-marker]:hidden">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90" fill="currentColor" aria-hidden="true"><path d="M8 5l10 7-10 7z" /></svg>
          <span className="group-open:hidden">{t('查看完整分析', 'View full analysis', '詳しい分析を見る', '전체 분석 보기')}</span><span className="hidden group-open:inline">{t('收起完整分析', 'Hide full analysis', '詳しい分析を閉じる', '전체 분석 접기')}</span>
          <span className="text-sm font-normal text-slate-500">{t('（各來源查詢結果、規則、AI、風險指數）', '(sources, rules, AI and risk score)', '（各情報源の結果・ルール・AI・リスク指標）', '(출처별 결과, 규칙, AI, 위험 지수)')}</span>
        </summary>
        <div className="space-y-4 border-t border-slate-200 p-3 sm:p-4">
      <Section step={1} title={t('Cofacts 查核結果', 'Cofacts results', 'Cofactsの検証結果', 'Cofacts 팩트체크 결과')}>
        <p className={c.status === 'error' ? 'text-red-700' : 'text-slate-700'}>{messageText(c.message)}</p>
        {c.status === 'not_found' && <p className="text-sm text-slate-600">{t('查無資料不代表沒有詐騙風險。', 'No match does not rule out a scam.', '該当情報がなくても詐欺のリスクは否定できません。', '검색 결과가 없어도 사기 위험은 있을 수 있습니다.')}</p>}
        {c.matches.map((m) => (
          <div key={m.url} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="pill bg-slate-100">{messageText(MATCH_ZH[m.match_type])}</span>
              <span className={`pill ${m.reply_type === 'RUMOR' ? 'bg-red-100 text-red-800' : 'bg-slate-100'}`}>{t('查核回覆：', 'Fact-check rating: ', '検証結果：', '팩트체크 판정: ')}{messageText(m.reply_type_zh)}</span>
            </div>
            <p className="mt-2 break-words text-sm">{m.title}</p>
            {m.reply_excerpt && <p className="mt-1 break-words text-sm text-slate-600">{t('回覆摘要：', 'Reply excerpt: ', '回答の抜粋：', '답변 발췌: ')}{m.reply_excerpt}</p>}
            <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-block text-sm">{t('在 Cofacts 查看原始查核 ↗', 'Read the original on Cofacts ↗', 'Cofactsで元の検証を見る ↗', 'Cofacts에서 원문 보기 ↗')}</a>
          </div>
        ))}
        {c.matches.length > 0 && (
          <p className="text-xs text-slate-500">{t(`資料來源：Cofacts 真的假的（cofacts.tw），以 ${c.license} 授權。查核內容由 Cofacts 社群編輯提供，非本網站人工查核。`, `Source: Cofacts (cofacts.tw), licensed under ${c.license}. The fact-checks are provided by the Cofacts community, not written by this site.`, `出典：Cofacts（cofacts.tw）、ライセンス：${c.license}。検証はこのサイトではなくCofactsのコミュニティが行っています。`, `출처: Cofacts(cofacts.tw), 이용 허락: ${c.license}. 팩트체크는 이 사이트가 아닌 Cofacts 커뮤니티에서 작성했습니다.`)}</p>
        )}
      </Section>

      {fc && !['disabled', 'not_requested'].includes(fc.status) && (
        <Section title={t('Google 事實查核搜尋', 'Google fact-check search', 'Googleファクトチェック検索', 'Google 팩트체크 검색')}>
          <p className={fc.status === 'error' ? 'text-red-700' : 'text-slate-700'}>{messageText(fc.message)}</p>
          {fc.items.map((it) => (
            <div key={it.url} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="break-words">{it.claim}</p>
              <p className="text-slate-600">{it.publisher}{it.rating && `${t('：', ': ', '：', ': ')}${it.rating}`}{it.date && ` · ${it.date}`}</p>
              <a href={it.url} target="_blank" rel="noopener noreferrer nofollow">{t('查看查核報告 ↗', 'Read fact-check report ↗', '検証記事を読む ↗', '팩트체크 보고서 보기 ↗')}</a>
            </div>
          ))}
        </Section>
      )}

      {u && (
        <Section step={2} title={t('網址安全檢查', 'URL safety checks', 'URLの安全性チェック', 'URL 안전성 검사')}>
          {u.url_count === 0 ? <p className="text-slate-700">{t('訊息中沒有網址。', 'There are no URLs in the message.', 'メッセージにURLはありません。', '메시지에 URL이 없습니다.')}</p> : (
            <ul className="space-y-2">
              <UrlRow name={t('165 涉詐網站名單（警政署）', 'Taiwan police 165 fraud site list', '台湾警察の165詐欺サイトリスト', '대만 경찰청 165 사기 사이트 목록')} status={u.tw165.status === 'listed' ? 'found' : u.tw165.status === 'not_listed' ? 'clean' : u.tw165.status} message={u.tw165.message}
                items={u.tw165.matches.map((m) => `${m.host_masked}${colon}${m.lists.map(messageText).join(separator)}${m.category ? `（${m.category}）` : ''}${m.month ? ` · ${m.month}` : ''}`)} />
              <UrlRow name={t('Google 安全瀏覽', 'Google Safe Browsing', 'Googleセーフブラウジング', 'Google 세이프 브라우징')} status={u.safe_browsing.status} message={u.safe_browsing.message} items={u.safe_browsing.threats.map((t) => `${t.host_masked}${colon}${messageText(t.detail)}`)} />
              <UrlRow name="VirusTotal" status={u.virustotal.status} message={u.virustotal.message} items={u.virustotal.threats.map((t) => `${t.host_masked}${colon}${messageText(t.detail)}`)} />
            </ul>
          )}
          <p className="text-xs text-slate-500">{t('網站不會開啟你訊息中的網址。165 名單來自政府資料開放平臺（政府資料開放授權條款）；Google 安全瀏覽結果由 Google 提供，可能有誤判或漏判。', 'This site does not open links in your message. The 165 list comes from Taiwan’s government open data platform under the Open Government Data License. Google provides Safe Browsing results, which can flag harmless sites or miss threats.', 'このサイトはメッセージ内のURLを開きません。165リストは台湾政府のオープンデータプラットフォームが政府資料開放授権条款の下で提供しています。セーフブラウジングの結果はGoogleが提供し、誤検出や見落としがあり得ます。', '이 사이트는 메시지 속 URL을 열지 않습니다. 165 목록은 대만 정부 개방 데이터 플랫폼이 정부 개방 데이터 이용 약관에 따라 제공합니다. 세이프 브라우징 결과는 Google이 제공하며 잘못 탐지하거나 위험을 놓칠 수 있습니다.')}</p>
        </Section>
      )}

      <Section step={3} title={t('規則分析結果', 'Rule-based findings', 'ルール分析の結果', '규칙 분석 결과')}>
        {data.features.length === 0 ? (
          <p className="text-slate-700">{t('未偵測到規則庫中的已知風險特徵。這不代表訊息安全。', 'No known risk indicators matched the rules. This does not mean the message is safe.', '既知のリスクに該当するルールはありませんでした。メッセージが安全とは限りません。', '규칙에서 알려진 위험 신호를 찾지 못했습니다. 메시지가 안전하다는 뜻은 아닙니다.')}</p>
        ) : (
          <ul className="space-y-2">
            {data.features.map((f) => (
              <li key={f.feature_id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium">{messageText(f.label)} <span className="text-xs text-slate-500">({f.feature_id})</span></p>
                <p className="text-sm text-slate-600">{messageText(f.description)}</p>
                <p className="mt-1 break-words text-sm">{t('觸發依據：', 'Matched evidence: ', '一致した箇所：', '일치한 근거: ')}{f.triggers.map(messageText).join(separator)}</p>
                <p className="text-xs text-slate-500">{t('規則版本', 'Rule version', 'ルールのバージョン', '규칙 버전')} {f.rule_version} · {f.human_verified ? t('已人工驗證', 'reviewed by a person', '人による検証済み', '사람이 검증함') : t('尚未經人工驗證', 'awaiting human review', '人による検証は未実施', '아직 사람이 검증하지 않음')}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section step={4} title={t(`AI 分析（${providerOf(data.ai.provider)[0]}）`, `AI analysis (${providerOf(data.ai.provider)[0]})`, `AI分析（${providerOf(data.ai.provider)[0]}）`, `AI 분석(${providerOf(data.ai.provider)[0]})`)}>
        <AiBlock ai={data.ai} />
      </Section>

      <Section step={5} title={t('規則風險指數', 'Rule-based risk score', 'ルールに基づくリスク指標', '규칙 기반 위험 지수')}>
        <div className="flex flex-wrap items-end gap-4">
          <p className="text-4xl font-bold text-slate-900">{data.risk_score ?? '—'}<span className="text-base font-normal text-slate-500"> / 100</span></p>
          <RiskBadge level={data.risk_level} />
        </div>
        {data.risk_score !== null && (
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
            <div className="h-full bg-gradient-to-r from-sky-400 via-amber-400 to-red-500" style={{ width: `${data.risk_score}%` }} />
          </div>
        )}
        <ul className="list-disc space-y-1 pl-5 text-sm">{data.basis.map((b) => <li key={b}>{messageText(b)}</li>)}</ul>
        <Alert kind="info">{messageText(data.score_disclaimer)}</Alert>
      </Section>

      <Section step={6} title={t('查核來源與時間', 'Sources and time', '情報源とチェック時刻', '확인 출처 및 시각')}>
        <p className="text-sm">{t('查核時間：', 'Checked at: ', 'チェック時刻：', '확인 시각: ')}{formatTime(data.checked_at, lang)}</p>
        <p className="text-sm">{t('規則版本：', 'Rule version: ', 'ルールのバージョン：', '규칙 버전: ')}{data.rule_version} · Cofacts{colon}{c.mode === 'live' ? (c.status === 'skipped' ? t('未送出', 'not sent', '未送信', '보내지 않음') : t('已查詢', 'queried', '照会済み', '조회함')) : t('已關閉', 'off', '無効', '꺼짐')} · {t('外部 AI：', 'External AI: ', '外部AI：', '외부 AI: ')}{data.external_ai_used ? t('有', 'used', '使用', '사용함') : t('未使用', 'not used', '未使用', '사용하지 않음')}</p>
        {c.matches.length === 0 && <p className="text-sm text-slate-600">{t('本次沒有可引用的外部查核來源。', 'There is no external fact-check source to cite for this check.', '今回引用できる外部の検証資料はありません。', '이번 확인에서 인용할 외부 팩트체크 출처가 없습니다.')}</p>}
      </Section>
        </div>
      </details>

      <section className="card" aria-labelledby="feedback-heading">
        <div className="mx-auto max-w-xl space-y-4 px-2 sm:px-6">
          <h2 id="feedback-heading" className="text-center">{t('這次結果對你有幫助嗎？', 'Was this result helpful?', 'この結果は役に立ちましたか？', '이번 결과가 도움이 되었나요?')}</h2>
          {fb === 'helpful' || fb === 'unhelpful' ? <>
            <p role="status" className="text-center text-sm text-slate-700">{t('感謝回饋！', 'Thanks for your feedback!', 'ご意見ありがとうございます。', '의견을 보내 주셔서 감사합니다!')} · {fb === 'helpful' ? t('有幫助', 'Helpful', '役に立った', '도움이 됨') : t('沒幫助', 'Not helpful', '役に立たなかった', '도움이 안 됨')}</p>
            <ResultOpinion helpful={fb === 'helpful'} />
          </> : (
            <div className="flex justify-center gap-3">
              <button className="btn-secondary min-w-24" disabled={fb === 'sending'} onClick={() => sendFeedback(true)}>{t('有幫助', 'Helpful', '役に立った', '도움이 됨')}</button>
              <button className="btn-secondary min-w-24" disabled={fb === 'sending'} onClick={() => sendFeedback(false)}>{t('沒幫助', 'Not helpful', '役に立たなかった', '도움이 안 됨')}</button>
            </div>
          )}
          {fb === 'error' && <Alert kind="error">{t('回饋送出失敗', 'Could not send feedback', 'フィードバックを送信できませんでした', '의견을 보내지 못했습니다')}{fbError ? `${colon}${messageText(fbError)}` : t('，請檢查網路後再試一次。', '. Check your connection and try again.', '。通信状況を確認して再試行してください。', '. 연결을 확인한 뒤 다시 시도하세요.')}</Alert>}
        </div>
      </section>

      <Link to="/check" className="btn-primary no-underline hover:no-underline">{t('查核另一則訊息', 'Check another message', '別のメッセージをチェック', '다른 메시지 확인')}</Link>
    </div>
  )
}

const URL_STATUS: Record<string, [string, string]> = {
  found: ['⚠ 有疑慮', 'bg-red-100 text-red-800'],
  clean: ['未發現', 'bg-emerald-100 text-emerald-800'],
  not_requested: ['未勾選', 'bg-slate-100 text-slate-600'],
  disabled: ['未設定', 'bg-slate-100 text-slate-600'],
  no_url: ['沒有網址', 'bg-slate-100 text-slate-600'],
  rate_limited: ['已達上限', 'bg-amber-100 text-amber-900'],
  unavailable: ['暫停', 'bg-amber-100 text-amber-900'],
  error: ['查詢失敗', 'bg-amber-100 text-amber-900'],
}

function UrlRow({ name, status, message, items }: { name: string; status: string; message: string; items: string[] }) {
  const { t } = useLanguage()
  const messageText = (value: string) => checkMessage(t, value)
  const [label, cls] = URL_STATUS[status] ?? [status, 'bg-slate-100 text-slate-600']
  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{name}</span><span className={`pill ${cls}`}>{messageText(label)}</span></div>
      {status !== 'disabled' && status !== 'not_requested' && <p className="mt-1 text-sm text-slate-600">{messageText(message)}</p>}
      {items.map((t) => <p key={t} className="mt-1 break-words text-sm text-red-800">{t}</p>)}
    </li>
  )
}
