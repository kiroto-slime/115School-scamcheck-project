import { useLanguage } from '../language'
export default function Game() {
  const { t, lang } = useLanguage()
  return (
    <section className="space-y-4">
      <h1>{t("小方塊跑酷", "Block Parkour", "ブロックパルクール", "블록 파쿠르")}</h1>
      <p className="game-touch-hint">{t('左下移動，右下跳躍。空中再按一次可以二段跳。', 'Move at the bottom left and jump at the bottom right. Tap jump again in midair to double-jump.', '左下で移動、右下でジャンプ。空中でもう一度押すと二段ジャンプできます。', '왼쪽 아래에서 이동하고 오른쪽 아래에서 점프하세요. 공중에서 한 번 더 누르면 이단 점프를 합니다.')}</p>
      <p className="game-keyboard-hint">{t('用 ← → 或 A、D 移動；按空白鍵、↑ 或 W 跳躍。', 'Move with ← → or A/D. Jump with Space, ↑ or W.', '← → または A・D で移動し、スペース・↑・W でジャンプします。', '← → 또는 A/D로 이동하고 스페이스바, ↑ 또는 W로 점프하세요.')}</p>
      <details>
        <summary>{t('完整玩法與本機紀錄', 'How to play and saved scores', '遊び方と端末の記録', '게임 방법과 기기 기록')}</summary>
        <p>{t('可用畫面按鈕或鍵盤操作：← →／A、D 移動，空白鍵／↑／W 跳躍。空中再按一次可二段跳，提早放開可小跳。往右跑會消耗能量，能量用完會逐漸失去生命，吃 🍎 可以補充能量。', 'Use the on-screen buttons or the keyboard (← → or A/D to move, Space, ↑ or W to jump). Jump again in midair for a double jump or release early for a short hop. Running right uses energy. When it runs out, you gradually lose health. Eat 🍎 to regain energy.', '画面のボタンかキーボード（← → または A・D で移動、スペース・↑・W でジャンプ）で操作します。空中でもう一度押すと二段ジャンプ、早めに離すと小さく跳べます。右へ走るとエネルギーが減り、尽きると体力が徐々に減ります。🍎でエネルギーを回復できます。', '화면 버튼이나 키보드(← → 또는 A/D로 이동, 스페이스바·↑·W로 점프)로 조작합니다. 공중에서 다시 누르면 이단 점프를 하고 일찍 떼면 낮게 뜁니다. 오른쪽으로 달리면 에너지가 줄고, 다 쓰면 체력이 서서히 줄어듭니다. 🍎를 먹어 에너지를 회복하세요.')}</p>
        <p>{t(
        "每100分隨機讀取後台已發布的防詐練習題，作答後顯示解析；答對補滿能量，答錯扣少量生命（連續答錯扣更多）。題庫需連線；分數、排行榜與最近100筆作答只存在這個裝置的瀏覽器，不回傳後台、不列入研究。清除網站資料後紀錄也會消失。",
        "Every 100 points, you get a random published scam-awareness question and an explanation after you answer. A correct answer refills your energy. A wrong answer costs a little health, and consecutive mistakes cost more. Questions require an internet connection. Your scores, leaderboard and last 100 answers stay in this browser. They are not sent to the server or included in research. Clearing site data removes them.",
        "100点ごとに公開済みの詐欺対策問題がランダムに出題され、回答後に解説が表示されます。正解するとエネルギーが全回復し、不正解では体力が少し減ります。連続で間違えると減少量が増えます。出題にはインターネット接続が必要です。スコア、ランキング、直近100件の回答はこの端末のブラウザーにのみ保存されます。サーバーへの送信や研究への利用はありません。サイトデータを消去すると記録も消えます。",
        "100점마다 공개된 사기 예방 문제 중 한 문제가 무작위로 나오며 답을 고르면 해설이 표시됩니다. 정답을 맞히면 에너지가 가득 차고, 틀리면 체력이 조금 줄어듭니다. 연속으로 틀리면 체력이 더 많이 줄어듭니다. 문제를 받으려면 인터넷에 연결되어 있어야 합니다. 점수, 순위, 최근 답변 100개는 이 기기의 브라우저에만 저장되며 서버로 전송되거나 연구에 포함되지 않습니다. 사이트 데이터를 지우면 기록도 삭제됩니다.",
      )}</p></details>
      {lang !== 'zh-Hant' && <p className="text-sm text-slate-600">{t('練習題與答案解析保留出題原文。', 'Practice questions and their explanations appear in their original language.', '練習問題と解説は原文で表示します。', '연습 문제와 해설은 출제자가 작성한 원문으로 표시됩니다.')}</p>}
      <a href="/games/block-parkour/index.html" target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex">{t("另開獨立遊戲頁面", "Open game in a new tab", "ゲームを別のタブで開く", "새 탭에서 게임 열기")}</a>
      <iframe
        title={t("小方塊跑酷遊戲", "Block Parkour game", "ブロックパルクールのゲーム画面", "블록 파쿠르 게임")}
        src="/games/block-parkour/index.html"
        className="block w-full rounded-2xl border border-slate-300"
        style={{ height: 'min(680px, calc(100dvh - 80px))', minWidth: 0 }}
        allow="fullscreen"
      />
    </section>
  )
}
