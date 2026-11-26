import { checkMessage } from '../checkMessages'
import { studyMessage } from './studyMessages'
import { riskLabel, useLanguage } from '../language'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, postJson, researchId, type Feature } from '../api'
import { Alert, Section, Spinner, useHealth } from '../components/ui'

interface Case { case_id: string; title: string; simulated_content: string; reviewer_status: string }
interface StartRes { research_id: string; is_demo: boolean; pre_case: Case; post_case: Case; warnings: string[] }
interface Assist { type: string; title: string; tips?: string[]; risk_level?: string; risk_score?: number | null; features?: Feature[]; basis?: string[]; source_note?: string; disclaimer?: string }
interface Reveal { case_id: string; title: string; verified_label: 'scam' | 'legit'; label_basis: string }
type Step = 'intro' | 'pre' | 'post_initial' | 'assist' | 'post_assisted' | 'done'

function Question({ c, phase, onSubmit, busy }: { c: Case; phase: string; onSubmit: (d: string, r: string, ms: number) => void; busy: boolean }) {
  const { t } = useLanguage()
  const reasons: [string, string][] = [
    ['link', t("有可疑連結", "Suspicious link", "不審なリンクがある", "의심스러운 링크가 있음")],
    ['money', t("要求付款或匯款", "Asks for payment or a transfer", "支払いや送金を求めている", "결제나 송금을 요구함")],
    ['personal_data', t("要求個資或驗證碼", "Asks for personal details or a verification code", "個人情報や認証コードを求めている", "개인정보나 인증 코드를 요구함")],
    ['urgency', t("催促、時間壓力", "Pressure to act quickly", "対応を急かしている", "서두르도록 재촉함")],
    ['authority', t("自稱官方或權威", "Claims to represent an authority", "公的機関や権威者を名乗っている", "공식 기관이나 권위자라고 밝힘")],
    ['too_good', t("好處太誇張", "Offer seems too good to be true", "条件が良すぎる", "제안한 혜택이 지나치게 큼")],
    ['familiar_sender', t("看起來是認識的人", "Seems to be someone I know", "知人からの連絡に見える", "아는 사람이 보낸 것 같음")],
    ['looks_official', t("看起來很正式", "Looks official", "公式の連絡に見える", "공식적인 메시지로 보임")],
    ['no_red_flag', t("沒有看到可疑之處", "No suspicious signs noticed", "怪しい点が見当たらない", "의심스러운 점을 발견하지 못함")],
    ['gut_feeling', t("直覺", "Intuition", "直感", "직감")],
    ['system_hint', t("參考了輔助資訊", "Used the guidance provided", "ヒントを参考にした", "제공된 도움말을 참고함")],
    ['other', t("其他", "Other", "その他", "기타")],
  ]
  const decisions: [string, string][] = [
    ['scam', t("可能是詐騙", "Probably a scam", "詐欺の可能性がある", "사기일 가능성이 있음")],
    ['legit', t("應該是正常訊息", "Probably legitimate", "通常のメッセージだと思う", "정상 메시지로 보임")],
    ['unsure', t("無法判斷", "Cannot tell", "判断できない", "판단하기 어려움")],
  ]
  const [decision, setDecision] = useState('')
  const [reason, setReason] = useState('')
  const started = useRef(Date.now())
  useEffect(() => { started.current = Date.now(); setDecision(''); setReason('') }, [c.case_id, phase])
  return (
    <div className="space-y-3">
      <blockquote className="whitespace-pre-wrap break-words rounded-xl border-l-4 border-teal-600 bg-slate-50 p-3 text-slate-800">{c.simulated_content}</blockquote>
      <p className="text-xs text-slate-500">{t(`模擬案例「${c.title}」為研究團隊自行撰寫的虛構內容。`, `“${c.title}” is a fictional case written by the research team.`, `「${c.title}」は研究チームが作成した架空の事例です。`, `‘${c.title}’은 연구팀이 작성한 가상의 사례입니다.`)}</p>
      <fieldset>
        <legend className="label">{t("你的判斷", "Your assessment", "あなたの判断", "나의 판단")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {decisions.map(([v, l]) => (
            <label key={v} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 ${decision === v ? 'border-teal-600 bg-teal-50' : 'border-slate-300'}`}>
              <input type="radio" name={`d-${phase}`} value={v} checked={decision === v} onChange={() => setDecision(v)} /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`r-${phase}`} className="label">{t("主要判斷理由", "Main reason for your assessment", "判断した主な理由", "주요 판단 근거")}</label>
        <select id={`r-${phase}`} className="input min-h-11" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">{t("請選擇", "Select a reason", "選んでください", "선택하세요")}</option>
          {reasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {busy ? <Spinner label={t("送出中…", "Submitting…", "送信中…", "제출 중…")} /> : (
        <button className="btn-primary w-full sm:w-auto" disabled={!decision || !reason} onClick={() => onSubmit(decision, reason, Date.now() - started.current)}>{t("送出判斷", "Submit assessment", "判断を送信", "판단 제출")}</button>
      )}
    </div>
  )
}

export default function Research() {
  const { lang, t } = useLanguage()
  const { health } = useHealth()
  const [step, setStep] = useState<Step>('intro')
  const [b, setB] = useState(false)
  const [c, setC] = useState(false)
  const [session, setSession] = useState<StartRes | null>(null)
  const [assist, setAssist] = useState<Assist | null>(null)
  const [reveal, setReveal] = useState<Reveal[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState<number | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof ApiError ? e.message : '發生錯誤，請稍後再試。') } finally { setBusy(false) }
  }

  const start = () => run(async () => {
    const s = await postJson<StartRes>('/api/research/start', { consent_research: b, consent_secondary: c })
    researchId.set(s.research_id)
    setSession(s)
    setStep('pre')
  })

  const answer = (phase: 'pre' | 'post_initial' | 'post_assisted', next: Step) => (decision: string, reason: string, ms: number) => run(async () => {
    const cs = phase === 'pre' ? session!.pre_case : session!.post_case
    const r = await postJson<{ reveal?: Reveal[] }>('/api/research/answer', {
      research_id: session!.research_id, case_id: cs.case_id, phase, user_decision: decision, decision_reason_code: reason, response_time_ms: ms,
    })
    if (phase === 'post_initial') setAssist(await postJson<Assist>('/api/research/assistance', { research_id: session!.research_id }))
    if (r.reveal) setReveal(r.reveal)
    setStep(next)
  })

  const sendRating = (n: number) => run(async () => {
    await postJson('/api/feedback', { research_id: session!.research_id, rating: n })
    setRating(n)
  })

  if (health && !health.modes.research_collection_enabled)
    return <Alert kind="info">{t(
      "研究資料蒐集已結束，感謝參與！你仍可使用 ",
      "Study data collection has ended. Thank you for taking part! You can still use this service: ",
      "研究データの収集は終了しました。ご参加ありがとうございました。引き続き利用できるサービス：",
      "연구 데이터 수집이 종료되었습니다. 참여해 주셔서 감사합니다. 계속 이용할 수 있는 서비스: ",
    )}<Link to="/check">{t("防詐查核", "Check a message", "メッセージの確認", "메시지 확인")}</Link>{t('。', '', '', '')}</Alert>

  const progress = { intro: 0, pre: 1, post_initial: 2, assist: 3, post_assisted: 3, done: 4 }[step]
  return (
    <div className="space-y-4">
      <h1>{t("匿名研究測驗", "Anonymous research quiz", "匿名研究テスト", "익명 연구 퀴즈")}</h1>
      {lang !== 'zh-Hant' && <p className="text-sm text-slate-600">{t('研究案例和研究團隊撰寫的解析以原文顯示。', 'Study cases and explanations written by the research team appear in their original language.', '研究事例と研究チームによる解説は原文で表示します。', '연구 사례와 연구팀이 작성한 해설은 원문으로 표시됩니다.')}</p>}
      {step !== 'intro' && (
        <div className="h-2 w-full rounded-full bg-slate-200" role="progressbar" aria-label={t('測驗進度', 'Quiz progress', 'テストの進み具合', '퀴즈 진행 상황')} aria-valuemin={0} aria-valuemax={4} aria-valuenow={progress}>
          <div className="h-2 rounded-full bg-teal-600 transition-all" style={{ width: `${(progress / 4) * 100}%` }} />
        </div>
      )}
      {session?.warnings.map((w) => <Alert key={w} kind="warn">{studyMessage(lang, w)}</Alert>)}
      {error && <Alert kind="error">{studyMessage(lang, error)}</Alert>}

      {step === 'intro' && (
        <Section title={t("研究說明與同意", "Study information and consent", "研究の説明と同意", "연구 안내 및 동의")}>
          <ul className="list-disc space-y-1 pl-5 text-sm sm:text-base">
            <li><strong>{t("目的：", "Purpose. ", "目的：", "목적: ")}</strong>{t(
              "了解青少年判斷可疑訊息的方式，以及不同查核輔助是否有幫助。",
              "To understand how teenagers assess suspicious messages and whether different kinds of guidance help.",
              "若者が不審なメッセージをどう判断するか、異なる確認支援が役立つかを調べます。",
              "청소년이 의심스러운 메시지를 어떻게 판단하며 다양한 확인 도움말이 도움이 되는지 알아봅니다.",
            )}</li>
            <li><strong>{t("流程：", "What you will do. ", "手順：", "진행 방법: ")}</strong>{t(
              "先判斷一則模擬訊息 → 再判斷另一則難度相同的訊息，並看過系統提供的輔助資訊後再判斷一次。約 3 分鐘。",
              "Assess a simulated message, then a different one of the same difficulty. Read the guidance and reassess the second message. This takes about three minutes.",
              "まず模擬メッセージを1件判断し、次に同じ難易度の別のメッセージを判断します。ヒントを読んでから2件目をもう一度判断します。所要時間は約3分です。",
              "모의 메시지를 판단한 뒤 난이도가 같은 다른 메시지를 판단합니다. 시스템의 도움말을 읽고 두 번째 메시지를 다시 판단합니다. 약 3분 걸립니다.",
            )}</li>
            <li><strong>{t("蒐集項目：", "Data collected. ", "収集項目：", "수집 항목: ")}</strong>{t(
              "你的判斷、理由選項、作答時間、隨機研究編號。不蒐集姓名、學號、電話等身分資訊。",
              "Your assessments, selected reasons, response times and a random research ID. We do not collect names, student IDs, phone numbers or similar identifiers.",
              "判断、選んだ理由、回答時間、無作為に発行した研究IDを収集します。氏名、学籍番号、電話番号などは収集しません。",
              "판단, 선택한 근거, 응답 시간과 무작위 연구 ID를 수집합니다. 이름, 학번, 전화번호 등의 신원 정보는 수집하지 않습니다.",
            )}</li>
            <li><strong>{t("使用者與期間：", "Access and retention. ", "利用者と保存期間：", "이용자 및 기간: ")}</strong>{t(
              "僅本專題研究團隊與指導老師使用；研究結束或最長 2 年後刪除。",
              "Only the project team and supervising teacher use the data. It is deleted when the study ends or after two years at the latest.",
              "利用者は研究チームと指導教員のみです。研究終了時、遅くとも2年後に削除します。",
              "연구팀과 지도 교사만 사용하며 연구가 끝나거나 늦어도 2년 뒤에 삭제합니다.",
            )}</li>
            <li><strong>{t("第三方：", "Third parties. ", "第三者への提供：", "제3자 제공: ")}</strong>{t("研究測驗不會把資料傳給第三方。", "The quiz does not send data to third parties.", "研究テストのデータを第三者に送信することはありません。", "연구 퀴즈 데이터는 제3자에게 전송하지 않습니다.")}</li>
            <li><strong>{t("風險：", "Risks. ", "リスク：", "위험: ")}</strong>{t(
              "極低；模擬內容可能讓你聯想到過去不愉快的經驗，可隨時停止。",
              "Risk is very low. The simulated content may bring back unpleasant memories. You can stop at any time.",
              "リスクはごく低いものの、模擬内容から過去のつらい経験を思い出す場合があります。いつでも中止できます。",
              "위험은 매우 낮지만 모의 내용이 과거의 불쾌한 경험을 떠올리게 할 수 있습니다. 언제든 중단할 수 있습니다.",
            )}</li>
            <li><strong>{t("撤回：", "Withdrawal. ", "撤回：", "철회: ")}</strong>{t("可在 ", "Visit ", "", "")}<Link to="/privacy">{t("隱私與研究說明", "Privacy and research", "プライバシーと研究について", "개인정보 및 연구 안내")}</Link>{t(" 用研究編號撤回或刪除資料。", " to withdraw or delete data using your research ID.", "で研究IDを使い、撤回・削除できます。", "에서 연구 ID로 참여를 철회하거나 자료를 삭제할 수 있습니다.")}</li>
            <li>{t(
              '未滿 18 歲參與者，正式研究需經學校審查及法定代理人同意；目前為 ',
              'For participants under 18, the formal study requires school review and the consent of a legal guardian. Current mode: ',
              '18歳未満の方が正式な研究に参加するには、学校の審査と法定代理人の同意が必要です。現在のモード：',
              '만 18세 미만이 정식 연구에 참여하려면 학교 심사와 법정 대리인의 동의가 필요합니다. 현재 모드: ',
            )}{health?.modes.research_mode === 'formal' ? t('正式', 'Formal study', '正式研究', '정식 연구') : t('模擬（DEMO）', 'Simulation (DEMO)', '模擬研究（DEMO）', '모의 연구(DEMO)')}{t(' 模式。', '.', '。', '.')}</li>
          </ul>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={b} onChange={(e) => { setB(e.target.checked); if (!e.target.checked) setC(false) }} />
            <span>{t(
              "我自願將匿名作答資料用於校內研究（參與測驗必須勾選）。",
              "I voluntarily agree to the use of my anonymous responses for school research (required to take the quiz).",
              "匿名の回答を校内研究に利用することに、自分の意思で同意します（参加には同意が必要です）。",
              "익명 응답을 교내 연구에 사용하는 데 자발적으로 동의합니다(퀴즈 참여에 필요).",
            )}</span>
          </label>
          <label className={`flex min-h-11 items-start gap-3 ${b ? '' : 'opacity-50'}`}>
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={!b} checked={c} onChange={(e) => setC(e.target.checked)} />
            <span>{t(
              "（選填）我同意將經審查的衍生統計資料用於教育產品及商業可行性研究。",
              "Optional: I agree that reviewed statistics derived from the responses may be used for educational products and commercial feasibility research.",
              "任意：審査済みの集計統計を、教育用製品や事業化の可能性を調べる研究に利用することに同意します。",
              "선택 사항: 검토를 거친 파생 통계를 교육 제품 및 사업 타당성 연구에 활용하는 데 동의합니다.",
            )}</span>
          </label>
          <p className="text-sm text-slate-600">{t("不同意也沒關係，你仍可使用 ", "You can decline and still use this service: ", "同意しない場合もこちらを利用できます：", "동의하지 않아도 이용할 수 있는 서비스: ")}<Link to="/check">{t("防詐查核", "Check a message", "メッセージの確認", "메시지 확인")}</Link>{t('。', '', '', '')}</p>
          {busy ? <Spinner label={t("準備中…", "Preparing…", "準備中…", "준비 중…")} /> : <button className="btn-primary" disabled={!b} onClick={start}>{t("同意並開始", "Agree and start", "同意して開始", "동의하고 시작")}</button>}
        </Section>
      )}

      {session && step !== 'intro' && step !== 'done' && (
        <p className="text-sm text-slate-600">{t("你的研究編號：", "Your research ID: ", "あなたの研究ID：", "내 연구 ID: ")}<code className="rounded bg-slate-100 px-1 font-mono">{session.research_id}</code>{t("（撤回或刪除資料時使用，請記下）", " — Keep this ID to withdraw or delete your data.", "（撤回・データ削除に必要です。控えておいてください）", " (철회하거나 데이터를 삭제할 때 필요하니 기록해 두세요.)")}</p>
      )}

      {step === 'pre' && session && (
        <Section step={1} title={t("第一題：請自行判斷（沒有輔助）", "Question 1: Assess the message without guidance", "第1問：ヒントなしで判断してください", "1번: 도움 없이 메시지를 판단해 주세요")}>
          <Question c={session.pre_case} phase="pre" busy={busy} onSubmit={answer('pre', 'post_initial')} />
        </Section>
      )}
      {step === 'post_initial' && session && (
        <Section step={2} title={t("第二題：先憑第一印象判斷", "Question 2: Give your first impression", "第2問：まず第一印象で判断してください", "2번: 첫인상으로 판단해 주세요")}>
          <Question c={session.post_case} phase="post_initial" busy={busy} onSubmit={answer('post_initial', 'assist')} />
        </Section>
      )}
      {(step === 'assist' || step === 'post_assisted') && session && assist && (
        <Section step={3} title={t('輔助資訊：', 'Guidance: ', 'ヒント：', '도움말: ') + studyMessage(lang, assist.title)}>
          {assist.tips && <ul className="list-disc space-y-1 pl-5">{assist.tips.map((tip) => <li key={tip}>{studyMessage(lang, tip)}</li>)}</ul>}
          {assist.features && (
            <div className="space-y-2">
              <p>{t('規則分析等級：', 'Rule-based risk level: ', 'ルールによるリスクレベル：', '규칙 기반 위험 등급: ')}<strong>{riskLabel(lang, assist.risk_level ?? '—')}</strong>{t('（指數 ', ' (index ', '（指数 ', ' (지수 ')}{assist.risk_score ?? '—'} / 100{t('）', ')', '）', ')')}</p>
              {assist.features.length === 0 && <p className="text-sm">{t("未偵測到已知風險特徵（不代表安全）。", "No known risk indicators were detected. This does not establish that the message is safe.", "既知のリスクの特徴は検出されませんでした。安全が確認されたわけではありません。", "알려진 위험 징후가 감지되지 않았습니다. 메시지가 안전하다는 뜻은 아닙니다.")}</p>}
              <ul className="list-disc space-y-1 pl-5 text-sm">{assist.basis?.map((x) => <li key={x}>{checkMessage(t, x)}</li>)}</ul>
              <p className="text-xs text-slate-500">{studyMessage(lang, assist.source_note ?? '')} {studyMessage(lang, assist.disclaimer ?? '')}</p>
            </div>
          )}
          {step === 'assist' && <button className="btn-primary" onClick={() => setStep('post_assisted')}>{t("我看完了，再判斷一次", "I’ve read the guidance. Assess again", "ヒントを読み終えたので、もう一度判断する", "도움말을 읽었습니다. 다시 판단하기")}</button>}
        </Section>
      )}
      {step === 'post_assisted' && session && (
        <Section step={4} title={t("第二題：看過輔助後，你的判斷是？", "Question 2: What is your assessment after reading the guidance?", "第2問：ヒントを読んだ後、どう判断しますか？", "2번: 도움말을 읽은 뒤에는 어떻게 판단하나요?")}>
          <Question c={session.post_case} phase="post_assisted" busy={busy} onSubmit={answer('post_assisted', 'done')} />
        </Section>
      )}

      {step === 'done' && session && (
        <Section title={t("測驗完成，感謝參與！", "Quiz complete. Thank you for taking part!", "テストは終了です。ご参加ありがとうございました！", "퀴즈를 마쳤습니다. 참여해 주셔서 감사합니다!")}>
          <ul className="space-y-2">
            {reveal.map((r) => (
              <li key={r.case_id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium">{r.title}{t('：', ': ', '：', ': ')}{r.verified_label === 'scam' ? t('詐騙', 'Scam', '詐欺', '사기') : t('正常訊息', 'Legitimate message', '通常のメッセージ', '정상 메시지')}</p>
                <p className="text-sm text-slate-600">{r.label_basis}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm">{t("你的研究編號：", "Your research ID: ", "あなたの研究ID：", "내 연구 ID: ")}<code className="rounded bg-slate-100 px-1 font-mono">{session.research_id}</code>{t("。若想撤回或刪除資料，請到 ", ". To withdraw or delete your data, visit ", "。撤回・データ削除の手続き：", " · 동의 철회 및 데이터 삭제 안내: ")}<Link to="/privacy">{t("隱私與研究說明", "Privacy and research", "プライバシーと研究について", "개인정보 및 연구 안내")}</Link>{t('。', '', '', '')}</p>
          <div>
            <p className="label">{t("（自願）這個測驗對你了解詐騙有幫助嗎？", "Optional: Did this quiz help you understand scams?", "任意：このテストは詐欺への理解に役立ちましたか？", "선택 사항: 이 퀴즈가 사기를 이해하는 데 도움이 되었나요?")}</p>
            {rating ? <Alert kind="success">{t("已收到回饋，謝謝！", "Thank you for your feedback!", "ご回答ありがとうございました。", "의견을 보내 주셔서 감사합니다!")}</Alert> : (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => <button key={n} className="btn-secondary min-w-11" disabled={busy} onClick={() => sendRating(n)} aria-label={t(`${n} 分`, `${n} out of 5`, `5点中${n}点`, `5점 만점에 ${n}점`)}>{n}</button>)}
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  )
}
