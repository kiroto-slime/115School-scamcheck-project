/** 查核頁的外部服務選項：每個選項一行短字，詳細說明收在「查看更多」裡，用簡單圖示代替長文字 */
import type { ReactNode } from 'react'

export interface ServiceOption {
  key: string
  label: string
  /** 送出的資料類型：顯示成小標籤 */
  sends: ('文字' | '網址' | '網域' | '圖片影片')[]
  to: string
  checked: boolean
  onChange: (v: boolean) => void
  /** 暫時不能用（例如 AI 冷卻中）：變灰、不能勾 */
  disabled?: boolean
  /** 標籤旁的小提示（例如目前模型與剩餘次數） */
  chip?: ReactNode
  /** 展開說明裡的補充（例如模型順序） */
  detail?: ReactNode
}

const ICON: Record<string, ReactNode> = {
  文字: <path d="M4 6h16M4 12h10M4 18h13" />,
  網址: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  網域: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" /></>,
  圖片影片: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m4 16 5-5 4 4 2-2 5 5" /></>,
}

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON[name]}
    </svg>
  )
}

function SendTags({ sends }: { sends: ServiceOption['sends'] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {sends.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"><Icon name={s} />{s}</span>
      ))}
    </span>
  )
}

/** 流程示意：你的內容 → 遮蔽個資 → 勾選的服務 */
function FlowDiagram() {
  const box = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs text-slate-700'
  const arrow = <svg viewBox="0 0 24 12" className="h-3 w-6 shrink-0 text-slate-400" aria-hidden="true"><path d="M1 6h20m-5-4 5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
  return (
    <div className="flex items-center justify-between gap-1" role="img" aria-label="你的內容先在本網站遮蔽個資，再送到你勾選的服務">
      <div className={box}>你的內容</div>{arrow}
      <div className={box}>遮蔽手機、身分證、Email</div>{arrow}
      <div className={box}>只送到<br />打勾的服務</div>
    </div>
  )
}

/** 「全選」：只管下面這些查詢服務（不包含研究同意 B、C，那些必須個別自願勾選） */
function SelectAll({ options }: { options: ServiceOption[] }) {
  const usable = options.filter((o) => !o.disabled)
  const checkedCount = usable.filter((o) => o.checked).length
  const all = usable.length > 0 && checkedCount === usable.length
  return (
    <label className="flex min-h-11 items-center gap-3 border-b border-slate-200 pb-1">
      <input type="checkbox" className="h-5 w-5 shrink-0" disabled={!usable.length} checked={all}
        // 部分勾選時顯示「－」
        ref={(el) => { if (el) el.indeterminate = checkedCount > 0 && !all }}
        onChange={() => usable.forEach((o) => o.onChange(!all))} />
      <span className="text-sm font-medium">全選</span>
    </label>
  )
}

export function ServiceOptions({ options }: { options: ServiceOption[] }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-700">要一起查詢的服務</p>
      {options.length > 1 && <SelectAll options={options} />}
      <div className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-white" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5 9-10" /></svg>
        </span>
        規則分析、165 涉詐網站名單<span className="text-xs text-slate-500">（一定執行，不送出）</span>
      </div>
      {options.map((o) => (
        <label key={o.key} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
          <input type="checkbox" className="h-5 w-5 shrink-0" disabled={o.disabled} checked={o.checked && !o.disabled} onChange={(e) => o.onChange(e.target.checked)} />
          <span className={`text-sm ${o.disabled ? 'text-slate-400' : ''}`}>{o.label}</span>
          <SendTags sends={o.sends} />
          {o.chip}
        </label>
      ))}
      <details className="rounded-xl bg-slate-50 p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-teal-800">查看更多：這些服務會收到什麼？</summary>
        <div className="mt-2 space-y-3">
          <FlowDiagram />
          <ul className="space-y-2 text-sm">
            {options.map((o) => (
              <li key={o.key} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{o.label}</span><span className="text-slate-500">→ {o.to}</span><SendTags sends={o.sends} />
                {o.detail && <div className="w-full">{o.detail}</div>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">不勾選就不會送出。外部服務的結果可能誤判或漏判，查無資料不代表安全。圖片、影片只有勾選 Gemini 才會原樣送到 Google。</p>
        </div>
      </details>
    </div>
  )
}
