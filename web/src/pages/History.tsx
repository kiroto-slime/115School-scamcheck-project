import { useLanguage } from '../language'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, formatTime, type AnalysisResult } from '../api'
import { Alert, RiskBadge } from '../components/ui'
import { clearHistory, KEEP_DAYS, readHistory, removeHistory, resultSummary, saveReceipt, type CheckReceipt } from '../history'

export default function History() {
  const { lang, t } = useLanguage()
  const mediaLabels: Record<string, string> = {
    text: t('文字訊息', 'Text message', 'テキスト', '문자 메시지'),
    image: t('圖片截圖', 'Screenshot', 'スクリーンショット', '스크린샷'),
    video: t('短影片', 'Short video', '短い動画', '짧은 동영상'),
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
      <h1>{t("查核紀錄", "Check history", "確認履歴", "확인 기록")}</h1>
      <Alert kind="info">
        {t('紀錄只存在', 'Your history is stored only in ', '履歴は', '기록은 ')}<strong>{t('這台裝置的瀏覽器', 'the browser on this device', 'この端末のブラウザー', '이 기기의 브라우저')}</strong>
        {t(
          '裡，不含你輸入的原文；清除瀏覽資料或按下方「清除全部紀錄」就會消失。',
          '. It excludes the text you entered. Clear browser data or choose “Clear all history” below to remove it. ',
          'に保存され、入力した原文は含みません。閲覧データを消去するか、下の「履歴をすべて消去」で削除できます。',
          '에만 저장되며 입력한 원문은 포함되지 않습니다. 브라우저 데이터를 지우거나 아래의 ‘모든 기록 지우기’를 누르면 삭제됩니다. ',
        )}
        {t(
          `分析結果在伺服器保存 ${KEEP_DAYS} 天，之後紀錄會自動移除。`,
          `The server keeps results for ${KEEP_DAYS} days. Entries are removed automatically after that. `,
          `分析結果のサーバー保存期間は${KEEP_DAYS}日です。期限が過ぎると履歴から自動的に削除されます。`,
          `분석 결과는 서버에 ${KEEP_DAYS}일간 보관되며 이후 기록이 자동으로 삭제됩니다. `,
        )}
        <strong>{t('使用學校或公用電腦時，用完請清除紀錄。', 'Clear your history after using a school or shared computer.', '学校や公共のパソコンを使った後は履歴を消去してください。', '학교나 공용 컴퓨터를 사용한 뒤에는 기록을 지워 주세요.')}</strong>
      </Alert>

      {items.length === 0 ? (
        <div className="card space-y-3">
          <p className="text-slate-700">{t("目前沒有查核紀錄。", "Your check history is empty.", "確認履歴はまだありません。", "아직 확인 기록이 없습니다.")}</p>
          <Link to="/check" className="btn-primary no-underline hover:no-underline">{t("去查核一則訊息", "Check a message", "メッセージを確認する", "메시지 확인하기")}</Link>
        </div>
      ) : (
        <>
          {lang !== 'zh-Hant' && items.some((h) => h.reason) && <p className="text-sm text-slate-600">{t('主要原因保留查核當時的原文。', 'Saved reasons appear in the language of the original check.', '判定理由は確認時の原文で表示します。', '판단 근거는 확인 당시의 원문으로 표시됩니다.')}</p>}
          <ul className="space-y-3">
            {items.map((h) => (
              <li key={h.id} className="card space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {h.job ? <strong>{h.job === 'pending' ? t('處理中', 'Processing', '処理中', '처리 중') : t('查核未完成', 'Check incomplete', '未完了', '확인 미완료')}</strong> : <RiskBadge level={h.level} />}
                  <span className="text-sm text-slate-500">{mediaLabels[h.media] ?? h.media} · {formatTime(h.at, lang)}</span>
                </div>
                {h.reason && <p className="break-words text-slate-700">{h.reason}</p>}
                <div className="flex flex-wrap gap-2">
                  <Link to={`/result/${h.id}`} className="btn-primary no-underline hover:no-underline">{t("查看結果", "View result", "結果を見る", "결과 보기")}</Link>
                  <button className="btn-secondary" onClick={() => remove(h.id)}>{t("從紀錄移除", "Remove from history", "履歴から削除", "기록에서 삭제")}</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {confirmClear ? (
              <>
                <button className="btn-danger" onClick={clearAll}>{t(`確定清除全部 ${items.length} 筆紀錄`, `Confirm deletion of all entries (${items.length})`, `履歴${items.length}件をすべて消去する`, `기록 ${items.length}개 모두 지우기 확인`)}</button>
                <button className="btn-secondary" onClick={() => setConfirmClear(false)}>{t("取消", "Cancel", "キャンセル", "취소")}</button>
              </>
            ) : (
              <button className="btn-secondary" onClick={() => setConfirmClear(true)}>{t("清除全部紀錄", "Clear all history", "履歴をすべて消去", "모든 기록 지우기")}</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
