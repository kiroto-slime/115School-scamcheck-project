import { useLanguage, tc } from '../language'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, formatTime, type AnalysisResult } from '../api'
import { Alert, RiskBadge } from '../components/ui'
import { clearHistory, KEEP_DAYS, readHistory, removeHistory, resultSummary, saveReceipt, type CheckReceipt } from '../history'

export default function History() {
  const { lang, t } = useLanguage()
  const mediaLabels: Record<string, string> = {
    text: tc('History', '文字訊息'),
    image: t('圖片截圖'),
    video: t('短影片'),
  }
  const [items, setItems] = useState(() => readHistory())
  const [confirmClear, setConfirmClear] = useState(false)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const sync = async () => {
      const pending = readHistory().filter(item => item.job === 'pending')
      for (const item of pending) {
        if (!active || document.hidden) break
        try {
          const result = await api<AnalysisResult | CheckReceipt>(`/api/analysis/${item.id}`)
          if (!active || !readHistory().some(row => row.id === item.id)) continue
          if (!('job_status' in result)) saveReceipt(resultSummary(result))
          else if (result.job_status === 'failed') saveReceipt({ ...item, job: 'failed' })
        } catch (err) {
          if (active && err instanceof ApiError && err.status === 404 && readHistory().some(row => row.id === item.id)) saveReceipt({ ...item, job: 'failed' })
        }
      }
      if (!active) return
      setItems(readHistory())
      timer = setTimeout(sync, 5000)
    }
    const updateList = () => setItems(readHistory())
    void sync()
    window.addEventListener('storage', updateList)
    return () => { active = false; clearTimeout(timer); window.removeEventListener('storage', updateList) }
  }, [])
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
      <h1>{t('查核紀錄')}</h1>
      <Alert kind="info">
        {t('紀錄只存在')}<strong>{t('這台裝置的瀏覽器')}</strong>
        {t('裡，不含你輸入的原文；清除瀏覽資料或按下方「清除全部紀錄」就會消失。')}
        {t('分析結果在伺服器保存 {0} 天，之後紀錄會自動移除。', KEEP_DAYS)}
        <strong>{t('使用學校或公用電腦時，用完請清除紀錄。')}</strong>
      </Alert>

      {items.length === 0 ? (
        <div className="card space-y-3">
          <p className="text-slate-700">{t('目前沒有查核紀錄。')}</p>
          <Link to="/check" className="btn-primary no-underline hover:no-underline">{t('去查核一則訊息')}</Link>
        </div>
      ) : (
        <>
          {lang !== 'zh-Hant' && items.some((h) => h.reason) && <p className="text-sm text-slate-600">{t('主要原因保留查核當時的原文。')}</p>}
          <ul className="space-y-3">
            {items.map((h) => (
              <li key={h.id} className="card space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {h.job ? <strong>{h.job === 'pending' ? t('處理中') : t('查核未完成')}</strong> : <RiskBadge level={h.level} />}
                  <span className="text-sm text-slate-500">{mediaLabels[h.media] ?? h.media} · {formatTime(h.at, lang)}</span>
                </div>
                {h.reason && <p className="break-words text-slate-700">{h.reason}</p>}
                <div className="flex flex-wrap gap-2">
                  <Link to={`/result/${h.id}`} className="btn-primary no-underline hover:no-underline">{t('查看結果')}</Link>
                  <button className="btn-secondary" onClick={() => remove(h.id)}>{t('從紀錄移除')}</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {confirmClear ? (
              <>
                <button className="btn-danger" onClick={clearAll}>{t('確定清除全部 {0} 筆紀錄', items.length)}</button>
                <button className="btn-secondary" onClick={() => setConfirmClear(false)}>{t('取消')}</button>
              </>
            ) : (
              <button className="btn-secondary" onClick={() => setConfirmClear(true)}>{t('清除全部紀錄')}</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
