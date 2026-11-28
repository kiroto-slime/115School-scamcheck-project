import { useLanguage } from '../language'
export default function Game() {
  const { t, lang } = useLanguage()
  return (
    <section className="space-y-4">
      <h1>{t('小方塊跑酷')}</h1>
      <p className="game-touch-hint">{t('左下移動，右下跳躍。空中再按一次可以二段跳。')}</p>
      <p className="game-keyboard-hint">{t('用 ← → 或 A、D 移動；按空白鍵、↑ 或 W 跳躍。')}</p>
      <details>
        <summary>{t('完整玩法與本機紀錄')}</summary>
        <p>{t('可用畫面按鈕或鍵盤操作：← →／A、D 移動，空白鍵／↑／W 跳躍。空中再按一次可二段跳，提早放開可小跳。往右跑會消耗能量，能量用完會逐漸失去生命，吃 🍎 可以補充能量。')}</p>
        <p>{t('每100分隨機讀取後台已發布的防詐練習題，作答後顯示解析；答對補滿能量，答錯扣少量生命（連續答錯扣更多）。題庫需連線；分數、排行榜與最近100筆作答只存在這個裝置的瀏覽器，不回傳後台、不列入研究。清除網站資料後紀錄也會消失。')}</p></details>
      {lang !== 'zh-Hant' && <p className="text-sm text-slate-600">{t('練習題與答案解析保留出題原文。')}</p>}
      <a href="/games/block-parkour/index.html" target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex">{t('另開獨立遊戲頁面')}</a>
      <iframe
        title={t('小方塊跑酷遊戲')}
        src="/games/block-parkour/index.html"
        className="block w-full rounded-2xl border border-slate-300"
        style={{ height: 'min(680px, calc(100dvh - 80px))', minWidth: 0 }}
        allow="fullscreen"
      />
    </section>
  )
}
