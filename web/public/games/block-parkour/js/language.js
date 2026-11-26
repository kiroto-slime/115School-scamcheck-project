// 遊戲只翻譯固定介面，題庫、玩家暱稱與排行榜資料使用原文。
const GameLanguage = (() => {
  const copies = new Map([
    ["name", ["小方塊跑酷", "Block Parkour", "ブロックパルクール", "블록 파쿠르"]],
    ["local", ["● 分數留在本機", "● Scores stay on this device", "● スコアはこの端末に保存", "● 점수는 이 기기에 저장"]],
    ["alarm", ["[ 23:47 ] 廣播風暴警報 · 機房等待救援", "[ 23:47 ] Broadcast storm alert · Server room needs help", "[ 23:47 ] ブロードキャストストーム警報・サーバー室に救援を", "[ 23:47 ] 브로드캐스트 폭풍 경보 · 서버실 구조 요청"]],
    ["locked", ["機房被鎖住了！", "The server room is locked!", "サーバー室がロックされた！", "서버실이 잠겼다!"]],
    ["mission", ["帶上小封包，完成今晚的逃脫任務。", "Take the little packet with you and escape tonight.", "小さなパケットと一緒に今夜の脱出に挑もう。", "작은 패킷과 함께 오늘 밤 탈출 임무를 완수하세요."]],
    ["opening", ["機房出現廣播風暴，帶上小方塊，準備進入跑酷挑戰。", "A broadcast storm is sweeping the server room. Grab your block and get ready to run.", "サーバー室でブロードキャストストームが発生。小さなブロックと一緒にパルクールに挑もう。", "서버실에 브로드캐스트 폭풍이 발생했습니다. 작은 블록과 함께 파쿠르에 도전하세요."]],
    ["nicknameLabel", ["挑戰者暱稱", "Player nickname", "プレイヤーのニックネーム", "플레이어 별명"]],
    ["nicknameInput", ["輸入你的暱稱", "Enter your nickname", "ニックネームを入力", "별명 입력"]],
    ["escape", ["開始逃脫 ▶", "Begin escape ▶", "脱出開始 ▶", "탈출 시작 ▶"]],
    ["detected", ["ERROR · 偵測到未知病毒", "ERROR · Unknown virus detected", "ERROR · 未知のウイルスを検出", "ERROR · 알 수 없는 바이러스 감지"]],
    ["infection", ["● 感染率 99.9%", "● 99.9% infected", "● 感染率 99.9%", "● 감염률 99.9%"]],
    ["corruptTerminal", ["[ ??:?? ] BUG VIRUS DETECTED · 網路已被改寫成遊戲", "[ ??:?? ] BUG VIRUS DETECTED · Network rewritten as a game", "[ ??:?? ] BUG VIRUS DETECTED · ネットワークがゲームに書き換えられた", "[ ??:?? ] BUG VIRUS DETECTED · 네트워크가 게임으로 변했습니다"]],
    ["corruptTitle", ["機房……還沒結束", "The server room… it’s not over", "サーバー室……まだ終わっていない", "서버실… 아직 끝이 아니다"]],
    ["corruptSubtitle", ["廣播風暴不是意外，是病毒幹的。", "The storm was no accident. A virus caused it.", "ブロードキャストストームは事故じゃない。ウイルスの仕業だ。", "브로드캐스트 폭풍은 사고가 아니었습니다. 바이러스의 소행입니다."]],
    ["story1", ["你以為廣播風暴只是有人接錯線？其實是潛伏在封包裡的「Bug 病毒」搞的鬼。它把整個機房網路改寫成一款 2D 動作遊戲，連小封包都被感染成了紅色。", "Think someone plugged in the wrong cable? A Bug virus hiding in a packet caused the storm. It turned the network into a 2D action game and even turned the little packet red.", "ケーブルのつなぎ間違いだと思った？ 原因はパケットに潜んだ「Bug ウイルス」。ネットワークを丸ごと2Dアクションゲームに書き換え、小さなパケットまで赤く染めてしまった。", "케이블을 잘못 연결한 걸까요? 사실 패킷 속에 숨어 있던 ‘버그 바이러스’가 원인입니다. 네트워크를 2D 액션 게임으로 바꾸고 작은 패킷까지 빨갛게 감염시켰습니다."]],
    ["story2", ["唯一的解法：以玩家身分進入遊戲，一路往右衝、踩扁 Bug。往右跑會消耗能量，能量用完生命會慢慢流失；吃 🍎 可補一點能量。每 100 分升級並抽一道後台發布的防詐題：答對補滿能量，答錯扣少量生命。達到 {0} 分就通關！通關後仍可繼續衝高分，直到生命歸零。", "Enter the game, run right and stomp the bugs. Moving right uses energy. When it runs out, you slowly lose health. Eat 🍎 to regain some energy. Every 100 points you level up and get a scam-awareness question. A correct answer refills energy. A mistake costs a little health. Reach {0} points to clear the game. Keep playing for a higher score until your health runs out.", "ゲームに入り、右へ走って Bug を踏みつけよう。右へ進むとエネルギーが減り、尽きると体力が減り始めます。🍎 で少し回復。100点ごとにレベルが上がり、詐欺対策問題が出ます。正解でエネルギー全回復、不正解で体力が少し減ります。{0}点でクリア！ 体力が尽きるまでハイスコアを目指せます。", "게임에 들어가 오른쪽으로 달리며 버그를 밟으세요. 앞으로 가면 에너지가 줄고, 바닥나면 체력이 서서히 줄어듭니다. 🍎를 먹으면 에너지가 조금 회복됩니다. 100점마다 레벨이 오르고 사기 예방 문제가 나옵니다. 맞히면 에너지가 가득 차고 틀리면 체력이 조금 줄어듭니다. {0}점에 도달하면 클리어! 체력이 다할 때까지 최고 점수에 도전할 수 있습니다."]],
    ["localNames", ["暱稱與排行榜只儲存在這個瀏覽器，不會上傳；請勿輸入真實姓名。", "Nicknames and rankings stay in this browser. Please use a nickname instead of your real name.", "ニックネームとランキングはこのブラウザーだけに保存し、送信しません。本名は入力しないでください。", "별명과 순위는 이 브라우저에만 저장되며 전송되지 않습니다. 실명은 입력하지 마세요."]],
    ["start", ["開始遊戲 ▶", "Start game ▶", "ゲーム開始 ▶", "게임 시작 ▶"]],
    ["canvas", ["小方塊跑酷遊戲畫面", "Block Parkour play area", "ブロックパルクールのゲーム画面", "블록 파쿠르 게임 화면"]],
    ["controls", ["遊戲控制", "Game controls", "ゲーム操作", "게임 조작"]],
    ["left", ["向左移動", "Move left", "左へ移動", "왼쪽으로 이동"]],
    ["right", ["向右移動", "Move right", "右へ移動", "오른쪽으로 이동"]],
    ["jump", ["跳躍", "Jump", "ジャンプ", "점프"]],
    ["pause", ["暫停", "Pause", "一時停止", "일시 정지"]],
    ["paused", ["遊戲已暫停", "Game paused", "一時停止中", "게임 일시 정지"]],
    ["resume", ["繼續遊戲", "Resume game", "ゲームを再開", "게임 계속"]],
    ["quiz", ["防詐小練習", "Scam awareness quiz", "詐欺対策ミニクイズ", "사기 예방 퀴즈"]],
    ["quizNote", ["作答只存在這個裝置，不上傳、不列入正式研究；答對補滿能量，答錯會扣少量生命，不影響分數。", "Answers stay on this device and are excluded from formal research. A correct answer refills energy. A mistake costs a little health. Your score is unaffected. Questions and explanations appear in their original language.", "回答はこの端末だけに保存し、送信や正式な研究への利用は行いません。正解でエネルギー全回復、不正解で体力が少し減ります。スコアには影響しません。問題と解説は原文です。", "답변은 이 기기에만 저장되며 전송되거나 정식 연구에 포함되지 않습니다. 정답은 에너지를 채우고 오답은 체력을 조금 줄입니다. 점수는 바뀌지 않습니다. 문제와 해설은 원문으로 표시됩니다."]],
    ["retryQuiz", ["重新載入題目", "Reload question", "問題を再読み込み", "문제 다시 불러오기"]],
    ["skip", ["略過並繼續", "Skip and continue", "スキップして続ける", "건너뛰고 계속"]],
    ["nameStat", ["暱稱", "Nickname", "ニックネーム", "별명"]],
    ["score", ["分數", "Score", "スコア", "점수"]],
    ["level", ["等級", "Level", "レベル", "레벨"]],
    ["switchPlayer", ["換新使用者", "Change player", "プレイヤー交代", "플레이어 변경"]],
    ["again", ["再試一次", "Play again", "もう一度遊ぶ", "다시 하기"]],
    ["rankTitle", ["本機排行榜", "Local leaderboard", "端末内ランキング", "기기 내 순위"]],
    ["rankTop", ["本機排行榜・前 10 名", "Local top 10", "端末内ランキング・上位10名", "기기 내 상위 10명"]],
    ["clearRanks", ["清除排行榜", "Clear leaderboard", "ランキングを消去", "순위 지우기"]],
    ["confirmClear", ["確定清除？", "Confirm clear?", "消去しますか？", "정말 지울까요?"]],
    ["close", ["關閉", "Close", "閉じる", "닫기"]],
    ["mute", ["關閉音效", "Mute sound", "効果音をオフ", "효과음 끄기"]],
    ["unmute", ["開啟音效", "Enable sound", "効果音をオン", "효과음 켜기"]],
    ["loading", ["正在讀取後台題目…", "Loading a practice question…", "問題を読み込み中…", "연습 문제를 불러오는 중…"]],
    ["emptyQuiz", ["後台尚無已發布題目。請管理員新增並發布，或先略過繼續玩。", "No questions have been published. Ask an administrator to publish one, or skip to continue playing.", "公開済みの問題がありません。管理者に公開を依頼するか、スキップして続けてください。", "공개된 문제가 없습니다. 관리자에게 문제 공개를 요청하거나 건너뛰고 계속하세요."]],
    ["unavailable", ["題庫暫時無法載入，請重試或略過繼續玩。", "Questions are unavailable. Retry or skip to continue.", "問題を読み込めません。再試行するかスキップしてください。", "문제를 불러올 수 없습니다. 다시 시도하거나 건너뛰세요."]],
    ["invalid", ["題目格式不完整，請通知管理員修正，或先略過繼續玩。", "This question is incomplete. Notify the administrator or skip to continue.", "問題の形式が不完全です。管理者に連絡するか、スキップしてください。", "문제 형식이 올바르지 않습니다. 관리자에게 알리거나 건너뛰고 계속하세요."]],
    ["timedOut", ["題庫連線逾時，請重試或略過繼續玩。", "The question request timed out. Retry or skip to continue.", "問題の読み込みがタイムアウトしました。再試行するかスキップしてください。", "문제 요청 시간이 초과되었습니다. 다시 시도하거나 건너뛰세요."]],
    ["correct", ["答對了！", "Correct! ", "正解！", "정답입니다! "]],
    ["incorrect", ["再記住這個重點：", "Remember this point: ", "このポイントを覚えよう：", "이 점을 기억하세요: "]],
    ["answer", ["正確答案：{0}", "Correct answer: {0}", "正解：{0}", "정답: {0}"]],
    ["fullEnergy", ["能量已補滿。", "Energy restored.", "エネルギーが全回復しました。", "에너지를 모두 회복했습니다."]],
    ["lostHealth", ["生命 -{0} 格。", "Health −{0}.", "体力 −{0}。", "체력 −{0}."]],
    ["zeroHealth", ["生命 -{0} 格，生命已歸零。", "Health −{0}. No health left.", "体力 −{0}。体力が尽きました。", "체력 −{0}. 체력이 모두 소진되었습니다."]],
    ["practiceFailed", ["這個瀏覽器無法保存作答紀錄，本次仍可繼續遊戲。", "This browser could not save your answer. You can keep playing.", "このブラウザーでは回答を保存できません。ゲームは続けられます。", "이 브라우저에 답변을 저장할 수 없습니다. 게임은 계속할 수 있습니다."]],
    ["clearToast", ["已通關！可以繼續挑戰更高分，直到生命歸零。", "Game cleared! Keep playing for a higher score until your health runs out.", "クリア！ 体力が尽きるまでハイスコアに挑戦できます。", "클리어! 체력이 다할 때까지 더 높은 점수에 도전하세요."]],
    ["wrongEnd", ["答錯題目，LIFE 歸零", "An incorrect answer used your last health.", "不正解で体力が尽きました。", "오답으로 체력이 모두 소진되었습니다."]],
    ["energyEnd", ["能量耗盡，LIFE 歸零", "You ran out of energy and health.", "エネルギーが切れ、体力が尽きました。", "에너지와 체력이 모두 소진되었습니다."]],
    ["fallEnd", ["掉進洞裡，LIFE 歸零", "You fell into a pit and lost your last health.", "穴に落ちて体力が尽きました。", "구덩이에 떨어져 체력이 모두 소진되었습니다."]],
    ["bugEnd", ["被 Bug 擊中，LIFE 歸零", "A bug hit you and used your last health.", "Bug に当たり、体力が尽きました。", "버그에 부딪혀 체력이 모두 소진되었습니다."]],
    ["clearedEnd", ["已通關！繼續挑戰時{0}", "You cleared the game! On your extended run: {0}", "クリア後の再挑戦：{0}", "클리어 후 이어 달리기: {0}"]],
    ["storeFailed", ["⚠️ 這個瀏覽器無法儲存成績（可能是無痕模式）", "⚠️ This browser could not save the score. It may be in private mode.", "⚠️ スコアを保存できませんでした。プライベートモードの可能性があります。", "⚠️ 이 브라우저에 점수를 저장할 수 없습니다. 비공개 모드일 수 있습니다."]],
    ["yourRank", ["{0}，你是本機排行榜第 {1} 名！", "{0}, you placed #{1} on this device!", "{0}さん、この端末で第{1}位です！", "{0}님, 이 기기에서 {1}위입니다!"]],
    ["tryRank", ["這次沒擠進前 10 名，再挑戰一次吧！", "Outside the top 10 this time. Try again!", "今回は上位10名に届きませんでした。再挑戦しよう！", "이번에는 10위 안에 들지 못했습니다. 다시 도전하세요!"]],
    ["emptyRank", ["還沒有紀錄，成為第一個上榜的玩家吧！", "No scores yet. Be the first on the board!", "まだ記録がありません。最初のランクインを目指そう！", "아직 기록이 없습니다. 첫 번째로 순위에 올라 보세요!"]],
    ["rank", ["名次", "Rank", "順位", "순위"]],
    ["result", ["結果", "Result", "結果", "결과"]],
    ["cleared", ["通關", "Cleared", "クリア", "클리어"]],
    ["finished", ["結束", "Finished", "終了", "종료"]],
    ["noName", ["請先輸入暱稱！", "Enter a nickname first.", "まずニックネームを入力してください。", "먼저 별명을 입력하세요."]],
    ["clearedBoard", ["本機排行榜已清除", "Local leaderboard cleared.", "端末内ランキングを消去しました。", "기기 내 순위를 지웠습니다."]],
    ["player", ["PLAYER", "PLAYER", "プレイヤー", "플레이어"]],
    ["life", ["LIFE", "LIFE", "体力", "체력"]],
    ["energy", ["ENERGY", "ENERGY", "エネルギー", "에너지"]],
    ["draining", ["能量耗盡，生命流失中！", "Energy empty! Losing health!", "エネルギー切れ！体力減少中", "에너지 소진! 체력 감소 중"]],
    ["hud", ["等級 {0}　｜　下次升級：{1} 分　｜　{2}", "Level {0} · Next: {1} pts · {2}", "レベル {0} ｜ 次：{1}点 ｜ {2}", "레벨 {0} · 다음: {1}점 · {2}"]],
    ["goal", ["目標：{0} 分", "Goal: {0} pts", "目標：{0}点", "목표: {0}점"]],
    ["goalReached", ["★ 已通關", "★ Cleared", "★ クリア", "★ 클리어"]],
    ["GAME CLEAR!", ["GAME CLEAR!", "GAME CLEAR!", "クリア！", "클리어!"]],
    ["GAME OVER", ["GAME OVER", "GAME OVER", "ゲームオーバー", "게임 오버"]],
    ["GAME START!", ["GAME START!", "GAME START!", "スタート！", "게임 시작!"]],
    ["LEVEL UP!", ["LEVEL UP!", "LEVEL UP!", "レベルアップ！", "레벨 업!"]],
    ["HIT!", ["HIT!", "HIT!", "ヒット！", "명중!"]],
    ["FALL!", ["FALL!", "FALL!", "落下！", "추락!"]],
    ["DAMAGE!", ["DAMAGE!", "DAMAGE!", "ダメージ！", "피해!"]],
  ]);
  const locales = ['zh-Hant', 'en', 'ja', 'ko'];
  let index = 0;
  const bindings = new Map();
  function text(key, ...values) {
    const template = copies.get(key)?.[index] ?? key;
    return values.length ? template.replace(/\{(\d+)\}/g, (_, n) => String(values[n])) : template;
  }
  function refreshNode(node) {
    if (node.dataset.copy) node.textContent = text(node.dataset.copy);
    if (node.dataset.copyLabel) node.setAttribute('aria-label', text(node.dataset.copyLabel));
    if (node.dataset.copyTitle) node.title = text(node.dataset.copyTitle);
    if (node.dataset.copyPlaceholder) node.placeholder = text(node.dataset.copyPlaceholder);
    if (node.id === 'ex-title') node.dataset.text = node.textContent;
  }
  function bind(node, keyOrRender) {
    delete node.dataset.copy;
    const render = typeof keyOrRender === 'function' ? keyOrRender : () => text(keyOrRender);
    bindings.set(node, render);
    node.textContent = render();
    if (node.id === 'ex-title') node.dataset.text = node.textContent;
  }
  function unbind(node) { bindings.delete(node); }
  function refresh(locale) {
    index = Math.max(0, locales.indexOf(locale));
    document.documentElement.lang = locales[index];
    document.querySelectorAll('[data-copy], [data-copy-title], [data-copy-label], [data-copy-placeholder]').forEach(refreshNode);
    for (const [node, render] of bindings) {
      node.textContent = render();
      if (node.id === 'ex-title') node.dataset.text = node.textContent;
    }
  }
  function selected() {
    try {
      if (parent !== window && parent.document.documentElement.lang)
        return parent.document.documentElement.lang.replace(/^zh-Hant-TW$/, 'zh-Hant');
      return localStorage.getItem('interfaceLanguage');
    } catch (_) { return 'zh-Hant'; }
  }
  refresh(selected());
  window.addEventListener('storage', event => {
    if (event.key === 'interfaceLanguage' || event.key === null) refresh(selected());
  });
  try {
    if (parent !== window) new MutationObserver(() => refresh(selected()))
      .observe(parent.document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  } catch (_) { /* 僅同源父頁能同步語言。 */ }
  return { text, bind, unbind, refreshNode };
})();
