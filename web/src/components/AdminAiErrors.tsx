import { useEffect, useState } from 'react'
import { Alert, Section, Spinner } from './ui'

type Call = <T>(path: string, init?: RequestInit) => Promise<T | null>
type Row = { model: string; category: string; status: number; count: number }
type Report = { days: { day: string; rows: Row[]; warnings?: { region_retry?: number } }[] }

// 只顯示分類，不含任何訊息內容
const LABELS: Record<string, string> = {
  model_unavailable: '模型不存在或不支援此 API（會讓該模型今天被跳過）',
  unsupported_input: '這個模型不支援這次的格式（只影響該筆）',
  region: 'Google 拒絕連線地區（網站會自動重試並換模型）',
  api_key: 'Gemini 金鑰無效',
  daily_quota: 'Google 回報今日額度已用完',
  minute_quota: '這一分鐘太多請求（429，不算額度）',
  busy: 'Google 暫時忙碌（5xx）',
  timeout: '超過 3 分鐘沒有回應',
  network: '連不到 Google',
  bad_response: 'Gemini 回覆格式無法解讀',
  other: '其他錯誤',
}

const valid = (r: Report | null) => r && Array.isArray(r.days) && r.days.every(d => typeof d.day === 'string' && Array.isArray(d.rows)) ? r : null

/** AI 錯誤紀錄：最近 7 個配額日，各模型的錯誤類型與次數 */
export function AdminAiErrors({ call }: { call: Call }) {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    call<Report>('/api/admin/ai/errors').then(r => {
      if (!active) return
      setReport(valid(r))
      setLoading(false)
    })
    return () => { active = false }
  }, [call])

  return <Section title="AI 錯誤紀錄（最近 7 天）">
    <p className="text-sm">只記錄日期、模型、錯誤類型、狀態碼和次數，不保存任何查核內容或 Google 的錯誤原文；保留 90 天。日期為美國太平洋時間的配額日。</p>
    {loading ? <Spinner label="載入 AI 錯誤紀錄…" /> : !report ? <p className="text-sm">無法載入 AI 錯誤紀錄，請重新整理頁面。</p> :
      <div className="space-y-3">
        {(() => {
          // 只給管理員看的提醒：使用者已拿到正常結果，不影響功能
          const total = report.days.reduce((sum, d) => sum + (d.warnings?.region_retry ?? 0), 0)
          return total > 0 && <Alert kind="warn">
            最近 7 天有 {total} 筆查核，因 Google 拒絕連線地區而重試超過 2 次後才成功。使用者已拿到正常結果；若經常發生，建議到 Google AI 開發者論壇回報地區判斷問題。
          </Alert>
        })()}
        {report.days.map(d => <div key={d.day}>
          <p className="font-medium">{d.day}</p>
          {(d.warnings?.region_retry ?? 0) > 0 && <p className="text-sm text-amber-700">⚠ {d.warnings!.region_retry} 筆查核重試超過 2 次後才成功</p>}
          {d.rows.length === 0 ? <p className="text-sm text-slate-600">這天沒有 AI 錯誤。</p> :
            <ul className="divide-y text-sm">{d.rows.map(r => <li key={`${r.model}|${r.category}|${r.status}`} className="grid gap-1 py-1 sm:grid-cols-2">
              <span className="min-w-0 break-all font-medium">{r.model}</span>
              <span className="min-w-0 break-words">{LABELS[r.category] ?? LABELS.other}<span className="block text-xs text-slate-600">HTTP {r.status || '—'}・{r.count} 次</span></span>
            </li>)}</ul>}
        </div>)}
      </div>}
  </Section>
}
