import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatTime } from '../api'
import { Alert, RiskBadge } from '../components/ui'
import { clearHistory, KEEP_DAYS, readHistory, removeHistory } from '../history'

const MEDIA_ZH: Record<string, string> = { text: '文字訊息', image: '圖片截圖', video: '短影片' }

export default function History() {
  const [items, setItems] = useState(() => readHistory())
  const [confirmClear, setConfirmClear] = useState(false)
  const remove = (id: string) => {
    removeHistory(id)
    setItems(readHistory())
  }
  const clearAll = () => {
    clearHistory()
    setItems([])
    setConfirmClear(false)
  }

  return (
    <div className="space-y-4">
      <h1>查核紀錄</h1>
      <Alert kind="info">
        紀錄只存在<strong>這台裝置的瀏覽器</strong>裡，不含你輸入的原文；清除瀏覽資料或按下方「清除全部紀錄」就會消失。
        分析結果在伺服器保存 {KEEP_DAYS} 天，之後紀錄會自動移除。<strong>使用學校或公用電腦時，用完請清除紀錄。</strong>
      </Alert>

      {items.length === 0 ? (
        <div className="card space-y-3">
          <p className="text-slate-700">目前沒有查核紀錄。</p>
          <Link to="/check" className="btn-primary no-underline hover:no-underline">去查核一則訊息</Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((h) => (
              <li key={h.id} className="card space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge level={h.level} />
                  {h.score !== null && <span className="text-sm text-slate-600">風險指數 {h.score}</span>}
                  <span className="text-sm text-slate-500">{MEDIA_ZH[h.media] ?? h.media} · {formatTime(h.at)}</span>
                </div>
                {h.reason && <p className="break-words text-slate-700">{h.reason}</p>}
                <div className="flex flex-wrap gap-2">
                  <Link to={`/result/${h.id}`} className="btn-primary no-underline hover:no-underline">查看結果</Link>
                  <button className="btn-secondary" onClick={() => remove(h.id)}>從紀錄移除</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {confirmClear ? (
              <>
                <button className="btn-danger" onClick={clearAll}>確定清除全部 {items.length} 筆紀錄</button>
                <button className="btn-secondary" onClick={() => setConfirmClear(false)}>取消</button>
              </>
            ) : (
              <button className="btn-secondary" onClick={() => setConfirmClear(true)}>清除全部紀錄</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
