import { studyMessage } from './studyMessages'
import { useLanguage, tc } from '../language'
import { useState } from 'react'
import { api, ApiError, postJson, researchId, researchWithdrawn } from '../api'
import { Alert, Section } from '../components/ui'

function RemoveOpinion() {
  const { t } = useLanguage()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <details>
    <summary>{t('用刪除碼移除心得')}</summary>
    <form className="mt-3 space-y-3" onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      setBusy(true)
      setMessage('')
      try {
        await api('/api/result-opinions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, referrerPolicy: 'no-referrer', body: JSON.stringify({ code }) })
        setCode('')
        setMessage(t('刪除要求已處理。'))
      } catch {
        setMessage(t('刪除失敗，請確認網路後再試。'))
      } finally { setBusy(false) }
    }}>
      <label className="label">{t('心得刪除碼')}<input className="input" required pattern="[a-f0-9]{32}" value={code} onChange={e => setCode(e.target.value.trim())} /></label>
      <button className="btn-secondary" disabled={busy}>{t('刪除這則心得')}</button>
      {message && <p role="status">{message}</p>}
    </form>
  </details>
}

export default function Privacy() {
  const { t } = useLanguage()
  const [rid, setRid] = useState(researchId.get() ?? '')
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const valid = /^R[A-Z0-9]{12}$/.test(rid.trim())

  const act = async (kind: 'withdraw' | 'delete') => {
    setMsg(null)
    try {
      const r = kind === 'withdraw'
        ? await postJson<{ message: string }>('/api/consent', { research_id: rid.trim(), purpose: 'research', status: 'withdrawn' })
        : await postJson<{ message: string }>('/api/privacy/delete', { research_id: rid.trim() })
      if ((kind === 'delete' || kind === 'withdraw') && researchId.get() === rid.trim()) researchId.clear()
      // 撤回後查核頁不再預設勾選「協助校內研究」，避免下次查核又自動同意
      if (kind === 'withdraw') researchWithdrawn.set()
      setMsg({ kind: 'success', text: r.message })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : '操作失敗，請稍後再試。' })
    } finally {
      setConfirmDelete(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1>{tc('Privacy', '隱私與研究說明')}</h1>
      <Section title={t('我們蒐集什麼、為什麼')}>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>{t('必要的暫時處理：')}</strong>{t('為完成你這次的查核，伺服器會暫時處理你輸入的文字或上傳的檔案。本站不保存原始圖片或影片。未同意研究者，不把訊息內容寫入資料庫。同意研究者，只保存已遮蔽姓名、地址、電話、Email、證號、帳號、車牌後的文字與去參數網址，保存到專題結束（由後台設定日期）。圖片、影片檔不保存，只保存你補充的文字與 AI 對內容的文字描述（同樣經遮蔽）。系統會盡力自動遮蔽，仍可能漏遮；請勿在內容中填寫他人的個資。')}</li>
          <li><strong>{t('自願的校內研究：')}</strong>{t('只在查核頁「協助校內研究」為勾選狀態時（預設勾選，可取消），保存已遮蔽個資的訊息內容與去參數網址、分析結果（風險特徵、等級、媒體類型）與研究測驗的作答（判斷、理由選項、作答時間）。')}</li>
          <li><strong>{t('自願的衍生用途：')}</strong>{t('只在你另外同意後，經人工審查的「彙總統計」才可能用於教育產品與商業可行性研究。不會販售或公開任何個別投稿。')}</li>
          <li>{t('我們不主動要求你提供姓名、學號、電話、身分證等身分資訊，使用隨機產生的研究編號；內容中若含有這類資訊，會盡力自動遮蔽。')}</li>
        </ul>
      </Section>
      <Section title={t('資料傳輸與第三方')}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t('若你勾選「送至 Cofacts 比對」，文字會在遮蔽手機、身分證、Email、長數字後送到 Cofacts「真的假的」官方公開 API 查詢（Cofacts 是臺灣的公民協作查核資料庫）。不勾選就不會送出。Cofacts 回傳的查核內容以 CC BY-SA 4.0 授權並標示來源。')}</li>
          <li>{t('若網站已設定 Gemini 且你勾選「使用 AI 分析」，文字（先遮蔽個資）、圖片與影片會送到 Google Gemini API 分析，並要求 Google 不保存這次請求。使用 Google 免費方案時，Google 可能依其條款使用送出的內容改進服務，因此')}<strong>{t('請勿上傳含有他人隱私或敏感資訊的內容')}</strong>{t('。不勾選就不會送出。')}</li>
          <li>{t('本網站架設在 Cloudflare（Workers 與 D1 資料庫），研究資料存放在 Cloudflare 的資料中心。')}</li>
          <li>{t('網站不會開啟或連線你訊息中的網址。')}</li>
        </ul>
      </Section>
      <Section title={t('保存期限')}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t('未同意研究的分析結果（不含原文）：保存 30 天，讓你可以從「查核紀錄」回來查看，之後自動刪除。')}</li>
          <li>{t('你的瀏覽器會暫存：①查核頁還沒送出的草稿（關掉分頁就清除）；②「查核紀錄」清單（只有結果編號、風險等級、時間和主要原因，不含你輸入的原文），存在你自己的瀏覽器，可隨時在「查核紀錄」頁清除。使用公用電腦時，用完請清除紀錄。')}</li>
          <li>{t('已同意研究者的訊息內容（已遮蔽個資）與去參數網址：保存至專題結束（後台設定的保存日期），到期後內容自動清空；整筆研究資料最長 2 年（可由管理者設定）。')}</li>
          <li>{t('本站不保存上傳的原始檔案。影片處理結束後，系統會向 Google 要求刪除。若上傳後中斷或未能確認刪除，Google 會在上傳 48 小時後自動刪除檔案。')}</li>
        </ul>
      </Section>
      <Section title={t('你的權利')}>
        <p>{t('你可以隨時撤回同意（之後不再蒐集），或刪除你研究編號底下的所有研究資料。撤回或拒絕不影響查核服務。')}</p>
        <div>
          <label htmlFor="rid" className="label">{t('研究編號')}</label>
          <input id="rid" className="input font-mono" value={rid} maxLength={13} placeholder={t('R 開頭共 13 碼')} onChange={(e) => setRid(e.target.value.toUpperCase())} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn-secondary" disabled={!valid} onClick={() => act('withdraw')}>{t('撤回研究同意')}</button>
          {confirmDelete ? (
            <>
              <button className="btn-danger" onClick={() => act('delete')}>{t('確定刪除（無法復原）')}</button>
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>{t('取消')}</button>
            </>
          ) : (
            <button className="btn-danger" disabled={!valid} onClick={() => setConfirmDelete(true)}>{t('刪除我的研究資料')}</button>
          )}
        </div>
        {msg && <Alert kind={msg.kind}>{studyMessage(msg.text)}</Alert>}
      </Section>
      <Section title={t('未成年參與者注意事項')}>
        <p>{t('本專題預計邀請高中學生參與。正式研究前須經學校審查，並依規定取得法定代理人同意；在核准前，系統只使用模擬研究模式（資料標示為 DEMO，不列入正式研究）。')}</p>
      </Section>
      <Section title={t('查核結果頁的改善意見')}>
        <p>{t('選擇「有幫助」或「沒幫助」後，可自由補充心得。團隊用這些回覆改善查核服務。心得與查核編號分開保存，收件與保存期限列在輸入欄下方。請勿填寫個資或原始訊息。')}</p>
        <RemoveOpinion />
      </Section>
      <Section title={t('聯絡方式')}>
        <p>{t('如有疑問或需要協助撤回、刪除資料，請聯絡專題研究團隊或指導老師（聯絡方式由學校公告）。')}</p>
      </Section>
    </div>
  )
}
