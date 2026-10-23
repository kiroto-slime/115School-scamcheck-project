export default function Game() {
  return (
    <section className="space-y-4">
      <h1>小方塊跑酷</h1>
      <p>電腦使用 ← →／A D 移動，空白鍵／↑／W 跳躍；手機使用遊戲內的左右與跳躍按鈕。空中再按一次可二段跳，放開跳躍鍵可小跳。</p>
      <details><summary>遊戲題目與本機紀錄</summary><p>每100分隨機讀取後台已發布的防詐練習題，作答後顯示解析。題庫需連線；分數、排行榜與最近100筆作答只存在這個裝置的瀏覽器，不回傳後台、不列入研究。清除網站資料後紀錄也會消失。</p></details>
      <a href="/games/block-parkour/index.html" target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex">另開獨立遊戲頁面</a>
      <iframe
        title="小方塊跑酷遊戲"
        src="/games/block-parkour/index.html"
        className="block w-full rounded-2xl border border-slate-300"
        style={{ height: 'min(680px, calc(100dvh - 80px))', minWidth: 0 }}
        allow="fullscreen"
      />
    </section>
  )
}
