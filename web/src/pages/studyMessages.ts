import { translate, type Language } from '../language'

/** 只翻譯已知的系統回應，外部或新版回應保留原文。 */
const messages: Record<string, readonly [string, string, string]> = {
  "已撤回同意，之後不再蒐集研究資料。若要刪除已蒐集資料，請使用「刪除我的研究資料」。": [
    "Consent withdrawn. No further research data will be collected. To erase data already collected, choose “Delete my research data”.",
    "同意を撤回しました。今後の研究データの収集は停止します。収集済みのデータを消去するには「自分の研究データを削除」を選んでください。",
    "동의를 철회했습니다. 앞으로 연구 데이터를 수집하지 않습니다. 이미 수집한 자료를 삭제하려면 ‘내 연구 데이터 삭제’를 선택하세요.",
  ],
  "已刪除此研究編號的研究資料。": [
    "Research data for this ID has been deleted.",
    "この研究IDの研究データを削除しました。",
    "이 연구 ID에 해당하는 연구 데이터를 삭제했습니다.",
  ],
  "感謝填答！此問卷只用於商業可行性研究，填答不代表購買。": [
    "Thank you! This survey is used only to study commercial feasibility. Your response is not a purchase.",
    "ご回答ありがとうございます。このアンケートは事業化の可能性を調べるためだけに使用します。回答による購入は発生しません。",
    "응답해 주셔서 감사합니다. 이 설문은 사업 타당성 연구에만 사용되며 응답이 구매로 이어지지는 않습니다.",
  ],
  "目前為模擬研究模式（DEMO），資料不列入正式研究。": [
    "This is a simulation (DEMO). Responses are excluded from the formal study.",
    "現在は模擬研究モード（DEMO）です。回答は正式な研究には含まれません。",
    "현재는 모의 연구 모드(DEMO)입니다. 응답은 정식 연구에 포함되지 않습니다.",
  ],
  "部分案例尚未完成人工審核，僅供系統測試。": [
    "Some cases are still awaiting human review and are for system testing only.",
    "一部の事例は人による審査が完了しておらず、システムテスト専用です。",
    "일부 사례는 담당자의 검토가 끝나지 않아 시스템 시험용으로만 사용됩니다.",
  ],
  "遇到要求匯款、轉帳或購買點數的訊息，先停下來查證。": [
    "If a message asks you to wire money, make a transfer or buy prepaid credits, stop and verify it first.",
    "送金、振込、プリペイドコードの購入を求められたら、手を止めて事実を確認しましょう。",
    "송금이나 계좌 이체, 선불 포인트 구매를 요구하는 메시지를 받으면 잠시 멈추고 사실인지 확인하세요.",
  ],
  "不要提供驗證碼、密碼或證件照片給任何人。": [
    "Do not give anyone your verification codes, passwords or photos of your ID.",
    "認証コード、パスワード、身分証の写真は誰にも渡さないでください。",
    "인증 코드, 비밀번호, 신분증 사진을 누구에게도 보내지 마세요.",
  ],
  "不要點擊不明連結，改用官方 App 或官方網站查詢。": [
    "Avoid unfamiliar links. Check using the official app or website.",
    "不明なリンクは開かず、公式アプリや公式サイトで確認してください。",
    "출처를 모르는 링크를 누르지 말고 공식 앱이나 웹사이트에서 확인하세요.",
  ],
  "有疑問可撥打 165 反詐騙專線，或詢問家人、老師。": [
    "If in doubt, call Taiwan’s 165 anti-fraud hotline or ask a family member or teacher.",
    "迷ったら台湾の詐欺相談窓口「165」に電話するか、家族や先生に相談してください。",
    "의심스러우면 대만의 사기 방지 상담 전화 165에 문의하거나 가족이나 선생님에게 물어보세요.",
  ],
  "一般防詐提醒": [
    "General scam prevention tips",
    "詐欺を防ぐためのヒント",
    "일반 사기 예방 수칙",
  ],
  "本網站的風險解釋": [
    "How this site explains the risks",
    "このサイトによるリスクの解説",
    "이 사이트의 위험 분석 해설",
  ],
  "研究模擬案例不進行外部 Cofacts 查詢。": [
    "Simulated research cases are not sent to Cofacts.",
    "研究用の模擬事例では Cofacts への外部照会は行いません。",
    "연구용 모의 사례는 Cofacts에 조회하지 않습니다.",
  ],
  "風險指數為規則加權分數，不是詐騙機率。": [
    "The risk index is a weighted score based on rules. It does not measure the probability of a scam.",
    "リスク指数はルールに基づく加重スコアで、詐欺の確率を表すものではありません。",
    "위험 지수는 규칙에 따라 가중치를 적용한 점수이며 사기 확률을 의미하지 않습니다.",
  ],
  "操作失敗，請稍後再試。": [
    "The request failed. Please try again later.",
    "操作に失敗しました。しばらくしてからもう一度お試しください。",
    "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  ],
  "送出失敗": [
    "The survey could not be submitted. Please try again.",
    "送信できませんでした。もう一度お試しください。",
    "설문을 제출하지 못했습니다. 다시 시도해 주세요.",
  ],
  "發生錯誤，請稍後再試。": [
    "Something went wrong. Please try again later.",
    "エラーが発生しました。しばらくしてからもう一度お試しください。",
    "오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  ],
  "伺服器發生錯誤，請稍後再試。": [
    "A server error occurred. Please try again later.",
    "サーバーエラーが発生しました。しばらくしてからもう一度お試しください。",
    "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  ],
  "無法連線到伺服器，請確認網路或後端是否已啟動。": [
    "Could not reach the server. Check your connection and try again.",
    "サーバーに接続できません。ネットワーク接続を確認してもう一度お試しください。",
    "서버에 연결할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.",
  ],
  "請求太頻繁，請稍候一分鐘再試。": [
    "Too many requests. Wait one minute and try again.",
    "リクエストが多すぎます。1分待ってからもう一度お試しください。",
    "요청이 너무 많습니다. 1분 후 다시 시도해 주세요.",
  ],
  "找不到研究編號，或已撤回參與。": [
    "Research ID not found, or participation was already withdrawn. Please check your ID.",
    "研究IDが見つからないか、すでに参加を撤回しています。IDをご確認ください。",
    "연구 ID를 찾을 수 없거나 이미 참여를 철회했습니다. ID를 확인해 주세요.",
  ],
  "研究同意已撤回，不再蒐集資料。": [
    "Consent was withdrawn. No further research data will be collected.",
    "研究への同意は撤回済みです。今後のデータ収集は行いません。",
    "연구 동의가 철회되어 더 이상 데이터를 수집하지 않습니다.",
  ],
  "研究資料蒐集已結束，感謝參與。基本查核服務仍可使用。": [
    "Study data collection has ended. Thank you for taking part. Message checking is still available.",
    "研究データの収集は終了しました。ご参加ありがとうございました。メッセージの確認は引き続き利用できます。",
    "연구 데이터 수집이 종료되었습니다. 참여해 주셔서 감사합니다. 메시지 확인 서비스는 계속 이용할 수 있습니다.",
  ],
  "研究資料蒐集已結束。": [
    "Study data collection has ended.",
    "研究データの収集は終了しました。",
    "연구 데이터 수집이 종료되었습니다.",
  ],
  "未同意研究資料蒐集，因此無法進入研究測驗；基本查核服務不受影響。": [
    "The study quiz requires consent to research data collection. Message checking is still available.",
    "研究テストへの参加にはデータ収集への同意が必要です。メッセージの確認は引き続き利用できます。",
    "연구 퀴즈에 참여하려면 데이터 수집에 동의해야 합니다. 메시지 확인 서비스는 계속 이용할 수 있습니다.",
  ],
  "目前沒有足夠的已審核研究案例（需要至少兩題相同難度）。": [
    "The quiz needs two reviewed cases of the same difficulty. There are not enough available yet. Please try again later.",
    "テストには同じ難易度の審査済み事例が2件必要です。現在は件数が足りないため、後ほどお試しください。",
    "퀴즈에는 난이도가 같은 검토 완료 사례가 2개 이상 필요합니다. 아직 사례가 부족하니 나중에 다시 시도해 주세요.",
  ],
  "請先完成後測案例的初步判斷，再查看輔助資訊。": [
    "Give your first assessment of the second case before viewing the guidance.",
    "ヒントを表示する前に、2問目の最初の判断を入力してください。",
    "도움말을 보기 전에 두 번째 사례에 대한 첫 판단을 입력해 주세요.",
  ],
  "案例與作答階段不符。": [
    "This case does not match the current stage. Check which question is open.",
    "事例と回答段階が一致しません。現在の設問を確認してください。",
    "사례가 현재 응답 단계와 일치하지 않습니다. 현재 문항을 확인해 주세요.",
  ],
  "此階段已作答。": [
    "You have already answered this stage.",
    "この段階にはすでに回答しています。",
    "이 단계는 이미 응답했습니다.",
  ],
  "請依序完成前面的階段。": [
    "Complete the earlier stages in order.",
    "前の段階から順に回答してください。",
    "앞 단계를 순서대로 완료해 주세요.",
  ],
  "撤回同意需要提供研究編號。": [
    "Enter your research ID to withdraw consent.",
    "同意を撤回するには研究IDを入力してください。",
    "동의를 철회하려면 연구 ID를 입력해 주세요.",
  ],
  "找不到有效的同意紀錄。": [
    "No active consent record was found. Please check your research ID.",
    "有効な同意記録が見つかりません。研究IDをご確認ください。",
    "유효한 동의 기록을 찾지 못했습니다. 연구 ID를 확인해 주세요.",
  ],
  "找不到研究編號。": [
    "Research ID not found. Please check the ID.",
    "研究IDが見つかりません。IDをご確認ください。",
    "연구 ID를 찾을 수 없습니다. ID를 확인해 주세요.",
  ],
}

export function studyMessage(lang: Language, original: string) {
  const translations = messages[original]
  return Object.hasOwn(messages, original) ? translate(lang, original, ...translations) : original
}
