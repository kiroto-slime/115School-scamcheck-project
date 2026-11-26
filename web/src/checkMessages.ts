import type { Copy } from './language'

type Translate = (...copy: Copy) => string
type Translations = [string, string, string]

// 後端與既有查核紀錄以繁中保存。只在顯示時翻譯系統產生的訊息。
const phrases = new Map<string, Translations>([
  // 輸入驗證、處理狀態、同意提示與媒體說明
  ['圖片格式不支援，請選擇 JPG、PNG 或 WebP。', ['Unsupported image format. Choose JPG, PNG or WebP.', '対応していない画像形式です。JPG、PNG、WebPを選んでください。', '지원하지 않는 이미지 형식입니다. JPG, PNG 또는 WebP를 선택하세요.']],
  ['影片格式不支援，請選擇 MP4 或 MOV。', ['Unsupported video format. Choose MP4 or MOV.', '対応していない動画形式です。MP4かMOVを選んでください。', '지원하지 않는 동영상 형식입니다. MP4 또는 MOV를 선택하세요.']],
  ['檔案是空的，請重新選擇。', ['This file is empty. Choose another file.', 'ファイルが空です。別のファイルを選んでください。', '빈 파일입니다. 다른 파일을 선택하세요.']],
  ['請輸入要查核的訊息內容。', ['Enter the message you want to check.', '確認したいメッセージを入力してください。', '확인할 메시지를 입력하세요.']],
  ['請先選擇檔案。', ['Choose a file first.', '先にファイルを選んでください。', '먼저 파일을 선택하세요.']],
  ['準備中…', ['Preparing…', '準備中…', '준비 중…']],
  ['AI 分析中，內容較長時可能需要 1～2 分鐘，請稍候…', ['AI is analyzing the text. Long messages may take 1–2 minutes…', 'AIで分析中です。長文の場合は1～2分ほどお待ちください…', 'AI가 분석 중입니다. 긴 메시지는 1~2분 걸릴 수 있습니다…']],
  ['分析文字與查詢來源中…', ['Analyzing text and checking sources…', 'テキストを分析し、情報源を照会しています…', '텍스트 분석 및 출처 조회 중…']],
  ['處理圖片中…', ['Processing image…', '画像を処理しています…', '이미지 처리 중…']],
  ['AI 判讀圖片中，可能需要 1～2 分鐘，請稍候…', ['AI is analyzing the image. This may take 1–2 minutes…', 'AIで画像を分析中です。1～2分ほどお待ちください…', 'AI가 이미지를 분석 중입니다. 1~2분 걸릴 수 있습니다…']],
  ['分析補充文字中…', ['Analyzing your additional text…', '補足テキストを分析しています…', '추가 설명 분석 중…']],
  ['上傳影片中…', ['Uploading video…', '動画をアップロードしています…', '동영상 업로드 중…']],
  ['Gemini 正在分析影片畫面與聲音（可能需要 30–90 秒）…', ['Gemini is analyzing the video and audio (this may take 30–90 seconds)…', 'Geminiが映像と音声を分析中です（30～90秒ほどかかる場合があります）…', 'Gemini가 영상과 소리를 분석 중입니다(30~90초 걸릴 수 있습니다)…']],
  ['發生未預期的錯誤，請稍後再試。', ['Something went wrong. Please try again later.', '予期しないエラーが発生しました。しばらくしてから再試行してください。', '예기치 않은 오류가 발생했습니다. 잠시 후 다시 시도하세요.']],
  ['這次未能記錄研究同意，查核照常進行，訊息內容不會被保存。', ['We could not record your research consent. The check will continue without storing your message.', '研究への同意を記録できませんでした。チェックは続行し、メッセージ内容は保存しません。', '이번 연구 동의를 기록하지 못했습니다. 확인은 계속 진행하며 메시지 내용은 저장하지 않습니다.']],
  ['這次未能記錄「教育產品與商業研究」同意，查核照常進行；下次送出時會再試一次。', ['We could not record consent for educational products and commercial research. The check will continue. We will try again on your next submission.', '教育製品・事業化研究への同意を記録できませんでした。チェックは続行し、次の送信時に記録を再試行します。', '교육 제품 및 사업성 연구 동의를 기록하지 못했습니다. 확인은 계속 진행하며 다음 제출 때 다시 시도합니다.']],
  ['瀏覽器無法處理圖片，請改用其他瀏覽器。', ['Your browser could not process the image. Try another browser.', 'このブラウザでは画像を処理できません。別のブラウザをお試しください。', '브라우저가 이미지를 처리하지 못했습니다. 다른 브라우저를 사용해 보세요.']],
  ['圖片已損毀或格式不支援，請重新選擇。', ['The image is damaged or unsupported. Choose another image.', '画像が破損しているか、非対応の形式です。別の画像を選んでください。', '이미지가 손상되었거나 지원하지 않는 형식입니다. 다른 이미지를 선택하세요.']],
  ['無法連線到伺服器，請確認網路或後端是否已啟動。', ['Cannot reach the server. Check your connection and try again.', 'サーバーに接続できません。通信状況を確認して再試行してください。', '서버에 연결할 수 없습니다. 네트워크 연결을 확인한 뒤 다시 시도하세요.']],
  ['請求太頻繁，請稍候一分鐘再試。', ['Too many requests. Wait one minute, then try again.', 'リクエストが多すぎます。1分待ってから再試行してください。', '요청이 너무 많습니다. 1분 뒤 다시 시도하세요.']],
  ['沒有使用 AI 時無法讀取圖片內容，請在「補充文字」輸入圖片中的文字。', ['Without AI we cannot read the image. Enter the image text in “Additional text”.', 'AIを使わない場合は画像を読み取れません。「補足テキスト」に画像内の文字を入力してください。', 'AI를 사용하지 않으면 이미지를 읽을 수 없습니다. ‘추가 설명’에 이미지 속 글을 입력하세요.']],
  ['沒有使用 AI 時無法讀取圖片內容，請在「補充文字」輸入圖片中的文字（或勾選使用 AI 分析）。', ['Without AI we cannot read the image. Enter its text in “Additional text” or select AI analysis.', 'AIを使わない場合は画像を読み取れません。「補足テキスト」に画像内の文字を入力するか、AI分析を選択してください。', 'AI를 사용하지 않으면 이미지를 읽을 수 없습니다. ‘추가 설명’에 이미지 속 글을 입력하거나 AI 분석을 선택하세요.']],
  ['請在「補充文字」輸入影片中的文字或旁白重點。', ['Enter the video’s on-screen text or main narration points in “Additional text”.', '「補足テキスト」に動画内の文字やナレーションの要点を入力してください。', '‘추가 설명’에 동영상 속 글이나 내레이션 요점을 입력하세요.']],
  ['檔案內容與格式不符，或不是有效的圖片。', ['The file does not match its image format. Choose a valid image.', 'ファイルが指定形式と一致しないか、有効な画像ではありません。画像を選び直してください。', '파일 내용과 형식이 일치하지 않거나 유효한 이미지가 아닙니다. 이미지를 다시 선택하세요.']],
  ['網站尚未設定 Gemini，無法分析影片內容；請改在補充文字輸入影片重點。', ['Gemini is unavailable on this site. Enter the video’s main points as additional text.', 'Geminiが未設定のため動画を分析できません。補足テキストに動画の要点を入力してください。', 'Gemini가 설정되지 않아 동영상을 분석할 수 없습니다. 추가 설명에 동영상 요점을 입력하세요.']],
  ['影片格式不支援，請上傳 MP4 或 MOV。', ['Unsupported video format. Upload an MP4 or MOV file.', '対応していない動画形式です。MP4かMOVをアップロードしてください。', '지원하지 않는 동영상 형식입니다. MP4 또는 MOV를 올려 주세요.']],
  ['缺少檔案大小資訊，請重新上傳。', ['File size information is missing. Upload the file again.', 'ファイルサイズが不明です。もう一度アップロードしてください。', '파일 크기 정보가 없습니다. 다시 업로드하세요.']],
  ['檔案內容不是有效的 MP4 / MOV 影片。', ['This is not a valid MP4 or MOV file. Choose another video.', '有効なMP4またはMOV動画ではありません。別の動画を選んでください。', '유효한 MP4 또는 MOV 동영상이 아닙니다. 다른 파일을 선택하세요.']],
  ['影片上傳憑證無效或已過期，請重新上傳。', ['The video upload has expired or is invalid. Upload it again.', '動画のアップロード情報が無効か期限切れです。もう一度アップロードしてください。', '동영상 업로드 정보가 유효하지 않거나 만료되었습니다. 다시 올려 주세요.']],
  ['圖片由 Gemini 直接判讀（含圖中文字），AI 可能出錯，請以原圖為準。', ['Gemini analyzed the image, including its text. AI may make mistakes. Refer to the original image.', 'Geminiが画像内の文字を含めて画像を分析しました。AIは誤る場合があるため、元の画像も確認してください。', 'Gemini가 이미지 속 글까지 분석했습니다. AI가 틀릴 수 있으니 원본 이미지를 확인하세요.']],
  ['未使用 AI，無法自動辨識圖片文字；以下只分析你輸入的補充文字。', ['AI was off. Only the additional text you entered was analyzed.', 'AIは使用していないため画像の文字は認識していません。以下は入力した補足テキストのみの分析です。', 'AI를 사용하지 않아 이미지 속 글은 인식하지 않았습니다. 아래 결과는 입력한 추가 설명만 분석한 것입니다.']],
  ['影片已送交 Gemini 分析畫面與聲音，分析完成後即刪除 Google 上的檔案。', ['The video was sent to Gemini for visual and audio analysis. The file is deleted from Google after analysis.', '映像と音声を分析するため動画をGeminiに送信しました。分析後、Google上のファイルを削除します。', '영상과 소리를 분석하기 위해 동영상을 Gemini에 보냈습니다. 분석이 끝나면 Google에 있는 파일을 삭제합니다.']],
  ['沒有使用 AI，未分析影片畫面與語音；以下只分析你輸入的補充文字。', ['AI was off. The video and audio were not analyzed. The results cover only the additional text you entered.', 'AIは使用していないため、映像と音声は分析していません。以下は入力した補足テキストのみの分析です。', 'AI를 사용하지 않아 영상과 음성은 분석하지 않았습니다. 아래 결과는 입력한 추가 설명만 분석한 것입니다.']],
  ['找不到這筆分析結果。', ['This result could not be found.', 'この分析結果が見つかりません。', '이 분석 결과를 찾을 수 없습니다.']],
  ['找不到這筆分析結果，可能已超過暫存期限而自動刪除。', ['This result is unavailable. It may have been automatically deleted after its retention period.', '分析結果が見つかりません。保存期限を過ぎて自動削除された可能性があります。', '분석 결과를 찾을 수 없습니다. 보관 기간이 지나 자동으로 삭제되었을 수 있습니다.']],
  ['讀取失敗', ['Could not load the result.', '結果を読み込めませんでした。', '결과를 불러오지 못했습니다.']],
  ['找不到分析紀錄。', ['No matching analysis record was found.', '分析記録が見つかりません。', '분석 기록을 찾을 수 없습니다.']],
  ['找不到研究編號。', ['The research ID could not be found.', '研究IDが見つかりません。', '연구 번호를 찾을 수 없습니다.']],
  // 結論、規則與安全行動
  ['很可能是詐騙，請不要照訊息的指示做', ['This is likely a scam. Do not follow the message’s instructions.', '詐欺の可能性が高いです。メッセージの指示に従わないでください。', '사기일 가능성이 높습니다. 메시지의 지시를 따르지 마세요.']],
  ['有可疑之處，請先查證再行動', ['Some signs look suspicious. Verify the message before acting.', '不審な点があります。行動する前に確かめてください。', '의심스러운 점이 있습니다. 행동하기 전에 사실을 확인하세요.']],
  ['目前沒有明顯的詐騙特徵，但仍要小心', ['No clear signs of fraud so far. Stay cautious.', '今のところ明らかな詐欺の兆候はありませんが、注意してください。', '현재 뚜렷한 사기 징후는 없지만 주의하세요.']],
  ['資訊不足，無法判斷；不代表安全', ['Too little information to assess. Safety is unconfirmed.', '情報不足で判断できません。安全とは限りません。', '정보가 부족해 판단할 수 없습니다. 안전하다는 뜻은 아닙니다.']],
  ['關鍵字規則', ['Keyword rules', 'キーワードルール', '키워드 규칙']],
  ['165 涉詐網站名單', ['165 fraud site list', '165詐欺サイトリスト', '165 사기 사이트 목록']],
  ['Google 安全瀏覽', ['Google Safe Browsing', 'Googleセーフブラウジング', 'Google 세이프 브라우징']],
  ['Cofacts 查核', ['Cofacts fact-checks', 'Cofactsの検証', 'Cofacts 팩트체크']],
  ['網址在警政署 165 涉詐網站名單上', ['The URL is on Taiwan police’s 165 fraud site list.', 'URLが台湾警察の165詐欺サイトリストに掲載されています。', 'URL이 대만 경찰청 165 사기 사이트 목록에 있습니다.']],
  ['Google 判定網址疑似詐騙或釣魚網站', ['Google flagged the URL as a suspected scam or phishing site.', 'Googleは詐欺またはフィッシングの疑いがあるURLと判定しています。', 'Google이 이 URL을 사기 또는 피싱 의심 사이트로 분류했습니다.']],
  ['多個資安引擎判定網址有惡意', ['Multiple security engines flagged the URL as malicious.', '複数のセキュリティエンジンが悪意あるURLと判定しています。', '여러 보안 엔진이 URL을 악성으로 분류했습니다.']],
  ['Cofacts 有相同或相似的訊息被查核為不實', ['Cofacts found false information in an identical or similar message.', 'Cofactsで同じ、または似たメッセージに誤情報が含まれると判定されています。', 'Cofacts에서 같거나 비슷한 메시지에 허위 정보가 있다고 확인했습니다.']],
  ['找到相關的事實查核報告', ['Related fact-check reports were found.', '関連する検証記事が見つかりました。', '관련 팩트체크 보고서를 찾았습니다.']],
  ['相同內容', ['Identical content', '同じ内容', '동일한 내용']],
  ['相似內容（不等於同一事件）', ['Similar content (may concern a different event)', '似た内容（同じ出来事とは限りません）', '비슷한 내용(같은 사건이라는 뜻은 아님)']],
  ['含有不實訊息', ['Contains false information', '誤情報を含む', '허위 정보 포함']],
  ['含有正確訊息', ['Contains accurate information', '正しい情報を含む', '정확한 정보 포함']],
  ['含有個人意見', ['Contains personal opinion', '個人の意見を含む', '개인 의견 포함']],
  ['不在查證範圍', ['Outside the scope of fact-checking', '検証の対象外', '팩트체크 대상 아님']],
  ['尚無查核回覆', ['No fact-check reply yet', '検証回答はまだありません', '아직 팩트체크 답변 없음']],
  ['⚠ 有疑慮', ['⚠ Potential threat', '⚠ 注意が必要', '⚠ 위험 의심']],
  ['未發現', ['None detected', '検出なし', '발견되지 않음']],
  ['未勾選', ['Not selected', '未選択', '선택 안 함']],
  ['未設定', ['Not configured', '未設定', '미설정']],
  ['沒有網址', ['No URLs', 'URLなし', 'URL 없음']],
  ['已達上限', ['Limit reached', '上限に到達', '한도 도달']],
  ['暫停', ['Unavailable', '一時停止中', '일시 중단']],
  ['查詢失敗', ['Lookup failed', '照会失敗', '조회 실패']],
  ['急迫時間壓力', ['Pressure to act immediately', 'すぐに行動するよう急かす', '시간을 내세워 재촉함']],
  ['以時間限制或倒數逼迫你立即行動，降低思考時間。', ['A deadline or countdown pushes you to act before you have time to think.', '期限やカウントダウンで即決を迫り、考える時間を奪います。', '마감이나 카운트다운으로 즉시 행동하도록 압박해 생각할 시간을 줄입니다.']],
  ['冒充官方或權威機構', ['Impersonation of an authority', '公的機関などのなりすまし', '공식 기관이나 권위자 사칭']],
  ['自稱政府、警察、銀行、電商或物流等機構，藉權威取得信任。', ['The sender claims to represent a government office, police, bank, retailer or courier to gain your trust.', '行政・警察・銀行・通販・配送業者などを名乗り、信用させようとします。', '정부, 경찰, 은행, 쇼핑몰, 배송업체 등을 사칭해 신뢰를 얻으려 합니다.']],
  ['要求付款或匯款', ['Request for payment or transfer', '支払いや送金の要求', '결제 또는 송금 요구']],
  ['要求匯款、轉帳、儲值、購買點數或先付費用。', ['The message asks you to transfer money, top up a balance, buy credits or pay in advance.', '送金・振込・チャージ・ポイント購入・前払いを求めています。', '송금, 계좌 이체, 충전, 포인트 구매 또는 선결제를 요구합니다.']],
  ['要求提供個人資料', ['Request for personal information', '個人情報の要求', '개인정보 요구']],
  ['要求身分證、住址、生日、存摺等個人資料。', ['The message requests personal details such as your ID, address, date of birth or bankbook.', '身分証・住所・生年月日・通帳などの個人情報を求めています。', '신분증, 주소, 생년월일, 통장 등 개인정보를 요구합니다.']],
  ['要求帳號或驗證碼', ['Request for credentials or verification codes', 'アカウント情報や認証コードの要求', '계정 정보 또는 인증 코드 요구']],
  ['要求提供密碼、OTP 驗證碼、網銀帳密或登入資訊。', ['The message asks for passwords, one-time codes, online banking credentials or login details.', 'パスワード、ワンタイムコード、ネットバンキングの認証情報などを求めています。', '비밀번호, 일회용 인증 코드, 인터넷 뱅킹 정보 또는 로그인 정보를 요구합니다.']],
  ['可疑網址或導流', ['Suspicious links or redirects', '不審なURL・外部への誘導', '의심스러운 URL 또는 외부 유도']],
  ['包含縮網址、IP 網址、非常見網域或要求加入私人 LINE / Telegram。', ['The message includes a short link, IP address, unusual domain or a request to move to a private LINE or Telegram chat.', '短縮URL、IPアドレス形式のURL、珍しいドメイン、または個人のLINE・Telegramへの誘導が含まれています。', '단축 URL, IP 주소, 흔하지 않은 도메인이 있거나 개인 LINE·Telegram 대화로 유도합니다.']],
  ['保證獲利或獎勵', ['Promises of guaranteed gains or rewards', '利益や景品を保証', '수익 또는 보상 보장']],
  ['宣稱穩賺不賠、高報酬、中獎或免費贈品。', ['The message promises guaranteed profits, high returns, a prize or a free gift.', '損をしない投資、高い利回り、当選、無料プレゼントなどをうたっています。', '손실 없는 수익, 높은 수익률, 당첨 또는 무료 선물을 약속합니다.']],
  ['恐懼、威脅或情感操控', ['Fear, threats or emotional pressure', '不安・脅迫・感情の操作', '공포, 협박 또는 감정 조작']],
  ['以威脅、恐嚇、羞辱或情感依附施壓。', ['Threats, intimidation, humiliation or emotional ties are used to pressure you.', '脅しや侮辱、親しい関係を利用して圧力をかけています。', '위협, 협박, 모욕 또는 정서적 유대감을 이용해 압박합니다.']],
  ['假冒特定身分', ['Impersonation of a person', '特定の人物のなりすまし', '특정 인물 사칭']],
  ['自稱親友、網紅、客服或熟人換了新帳號。', ['The sender poses as a relative, friend, influencer or customer service agent, or claims an acquaintance has a new account.', '親族・友人・有名人・サポート担当者を名乗ったり、知人の新アカウントを装ったりしています。', '가족, 친구, 유명인, 고객센터를 사칭하거나 지인이 계정을 바꿨다고 주장합니다.']],
  ['試圖操控 AI 判斷', ['Attempt to manipulate AI judgment', 'AIの判断を操作する指示', 'AI 판단 조작 시도']],
  ['訊息裡藏有要 AI 忽略指示或改判為安全的文字，正常通知不會這樣寫。', ['The message contains instructions for AI to disregard guidance or mark it as safe. Genuine notices do not include these instructions.', '指示を無視したり安全と判定したりするようAIに促す文が隠れています。通常の通知にはない表現です。', 'AI에게 지시를 무시하거나 안전하다고 판단하라는 문구가 숨어 있습니다. 정상적인 안내에는 이런 내용이 없습니다.']],
  ['其他可疑特徵', ['Other suspicious signs', 'その他の不審な兆候', '기타 의심 신호']],
  ['例如出租帳戶、代收包裹、高薪輕鬆打工等常見詐騙或人頭帳戶話術。', ['Examples include renting out accounts, receiving parcels for others or offers of easy, highly paid work. These are common in scams and money-mule recruitment.', '口座の貸与、荷物の代理受け取り、高収入で簡単な仕事など、詐欺や名義貸しの勧誘によく使われる表現です。', '계좌 대여, 대리 택배 수령, 쉬운 고수익 아르바이트 등 사기나 대포통장 모집에 자주 쓰는 표현입니다.']],
  ['不要依對方指示匯款、轉帳或購買點數；先暫停並與家人或師長討論。', ['Do not transfer money or buy credits as instructed. Pause and talk to a family member or teacher.', '指示に従って送金やポイント購入をしないでください。一度立ち止まり、家族や先生に相談してください。', '상대방의 지시에 따라 송금하거나 포인트를 구매하지 마세요. 일단 멈추고 가족이나 선생님과 상의하세요.']],
  ['任何人索取驗證碼、密碼都不要提供；正規機構不會用訊息要你提供。', ['Never give anyone your verification codes or passwords. Legitimate institutions will not ask for these by message.', '認証コードやパスワードは誰にも教えないでください。正式な機関がメッセージで提供を求めることはありません。', '누가 요청해도 인증 코드나 비밀번호를 주지 마세요. 정상적인 기관은 메시지로 이를 요구하지 않습니다.']],
  ['不要提供身分證、存摺或證件照片給不明對象。', ['Do not give strangers your ID, bankbook or photographs of official documents.', '知らない相手に身分証・通帳・証明書の写真を送らないでください。', '모르는 상대에게 신분증, 통장 또는 증명서 사진을 주지 마세요.']],
  ['不要點擊訊息中的連結；改用官方 App 或自行輸入官方網址查詢。', ['Avoid links in the message. Open the official app or type the official web address yourself.', 'メッセージ内のリンクは開かず、公式アプリか自分で入力した公式URLから確認してください。', '메시지 속 링크를 누르지 말고 공식 앱을 이용하거나 공식 주소를 직접 입력해 확인하세요.']],
  ['掛斷或停止回覆，自行查官方電話回撥確認，或撥打 165 反詐騙專線。', ['Hang up or stop replying. Find the official number yourself and call back, or call Taiwan’s 165 anti-fraud hotline.', '電話を切るか返信を止め、公式の電話番号を自分で調べてかけ直すか、台湾の詐欺相談窓口165に電話してください。', '전화를 끊거나 답장을 멈추세요. 공식 번호를 직접 찾아 확인하거나 대만 사기 상담 전화 165에 문의하세요.']],
  ['越被催促越要停下來，給自己時間查證。', ['If someone rushes you, pause and take time to verify what they say.', '急かされたときほど立ち止まり、時間を取って確認してください。', '재촉할수록 일단 멈추고 시간을 두고 확인하세요.']],
  ['保證獲利、高報酬幾乎都是詐騙常見話術，不要加入不明投資群組。', ['Guaranteed profits and high returns are common scam pitches. Avoid unfamiliar investment groups.', '「利益保証」や「高利回り」は詐欺でよく使われる誘い文句です。素性の分からない投資グループに参加しないでください。', '수익 보장과 고수익은 흔한 사기 수법입니다. 출처가 불분명한 투자 모임에 가입하지 마세요.']],
  ['遇到威脅或要求保密時，先告訴信任的大人。', ['If someone threatens you or demands secrecy, tell an adult you trust.', '脅されたり秘密にするよう求められたりしたら、信頼できる大人に話してください。', '협박을 받거나 비밀을 요구받으면 먼저 믿을 만한 어른에게 알리세요.']],
  ['親友說換了新帳號時，先用原本的電話或當面確認身分。', ['If a friend or relative says they have a new account, call their original number or confirm in person.', '家族や友人が新しいアカウントに変えたと言ったら、元の電話番号か対面で本人か確認してください。', '가족이나 친구가 계정을 바꿨다고 하면 기존 전화번호로 연락하거나 직접 만나 본인인지 확인하세요.']],
  ['不要出租、出借帳戶或代收包裹，這可能讓你成為詐騙集團的人頭而觸法。', ['Do not rent out or lend an account or receive parcels for strangers. You could become a front for fraud and face legal consequences.', '口座を貸したり、知らない人の荷物を代理で受け取ったりしないでください。詐欺に名義を使われ、法に触れるおそれがあります。', '계좌를 빌려주거나 남의 택배를 대신 받지 마세요. 사기 조직의 명의 제공자가 되어 법을 위반할 수 있습니다.']],
  ['訊息想騙過查核工具，正常通知不會這樣寫；請當作詐騙看待，不要照訊息指示做。', ['The message tries to fool the checking tool. Genuine notices do not do this. Treat it as a scam and do not follow its instructions.', 'チェックツールを欺こうとする文は通常の通知にはありません。詐欺として扱い、指示に従わないでください。', '이 메시지는 확인 도구를 속이려 합니다. 정상적인 안내에는 이런 문구가 없습니다. 사기로 보고 지시를 따르지 마세요.']],
  ['如仍有疑慮，可撥打 165 反詐騙諮詢專線或向家人、老師確認。', ['If you are still unsure, call Taiwan’s 165 anti-fraud hotline or ask a family member or teacher.', '不安が残る場合は、台湾の詐欺相談窓口165に電話するか、家族や先生に確認してください。', '의심이 남으면 대만 사기 상담 전화 165에 문의하거나 가족 또는 선생님에게 확인하세요.']],
  ['不要開啟訊息中的網址、不要輸入任何資料；有疑問可撥 165 反詐騙諮詢專線查證。', ['Do not open the links or enter any information. Call Taiwan’s 165 anti-fraud hotline if you need to verify the message.', 'メッセージ内のURLを開いたり情報を入力したりしないでください。不明な点は台湾の詐欺相談窓口165に確認できます。', '메시지 속 URL을 열거나 정보를 입력하지 마세요. 의문이 있으면 대만 사기 상담 전화 165에 확인하세요.']],
  ['風險指數為規則加權分數，不是經統計校準的詐騙機率，也不是司法認定。', ['The risk score is a weighted sum of rule matches. It is neither a statistically calibrated probability of fraud nor a legal finding.', 'リスク指標はルールに重みを付けた点数です。統計的に校正された詐欺の確率や司法判断を示すものではありません。', '위험 지수는 규칙에 가중치를 적용한 점수입니다. 통계적으로 보정된 사기 확률이나 법적 판단을 뜻하지 않습니다.']],
  // 來源查詢、計分依據與觸發說明
  ['多種高風險特徵同時出現（組合加權）', ['Several high-risk signs occurred together (additional weight).', '複数の高リスクの兆候が重なったため加点しました。', '여러 고위험 신호가 함께 나타나 추가 가중치를 적용했습니다.']],
  ['Cofacts 有相同訊息被查核為含有不實訊息（相似不等於同一事件）', ['Cofacts found false information in an identical message. Similar messages may concern different events.', 'Cofactsで同じメッセージに誤情報が含まれると判定されています。似た内容でも同じ出来事とは限りません。', 'Cofacts에서 동일한 메시지에 허위 정보가 있다고 확인했습니다. 내용이 비슷해도 같은 사건이라는 뜻은 아닙니다.']],
  ['Cofacts 有相似訊息被查核為含有不實訊息（相似不等於同一事件）', ['Cofacts found false information in a similar message. It may concern a different event.', 'Cofactsで似たメッセージに誤情報が含まれると判定されています。同じ出来事とは限りません。', 'Cofacts에서 비슷한 메시지에 허위 정보가 있다고 확인했습니다. 같은 사건이라는 뜻은 아닙니다.']],
  ['網址列在警政署 165 涉詐網站名單中', ['The URL is on Taiwan police’s 165 fraud site list.', 'URLが台湾警察の165詐欺サイトリストに掲載されています。', 'URL이 대만 경찰청 165 사기 사이트 목록에 있습니다.']],
  ['Google 安全瀏覽將網址標示為疑似不安全', ['Google Safe Browsing flagged the URL as potentially unsafe.', 'Googleセーフブラウジングが危険な可能性のあるURLとして報告しています。', 'Google 세이프 브라우징이 URL을 위험 의심으로 표시했습니다.']],
  ['內容過短，無法判斷。', ['The text is too short to assess.', '文章が短すぎるため判断できません。', '내용이 너무 짧아 판단할 수 없습니다.']],
  ['未偵測到規則庫中的已知風險特徵，但這不代表訊息安全。', ['No known risk indicators matched the rules. This does not mean the message is safe.', '既知のリスクに該当するルールはありませんでした。メッセージが安全とは限りません。', '규칙에서 알려진 위험 신호를 찾지 못했습니다. 메시지가 안전하다는 뜻은 아닙니다.']],
  ['出現限時字眼（例如「24 小時內」）', ['Time pressure (for example, “within 24 hours”)', '期限を示す表現（例：「24時間以内」）', '시간 제한 표현(예: ‘24시간 이내’)']],
  ['標榜固定報酬率（例如「獲利 20%」）', ['Promises a fixed return (for example, “20% profit”)', '固定の利回りをうたう表現（例：「利益20%」）', '고정 수익률 제시(예: ‘20% 수익’)']],
  ['出現要 AI 改變判斷的指令', ['Instructions for AI to change its judgment', 'AIに判断を変えるよう求める指示', 'AI의 판단을 바꾸려는 지시']],
  ['以 IP 位址組成的網址', ['URL using an IP address', 'IPアドレス形式のURL', 'IP 주소 형식의 URL']],
  ['國際化（punycode）網域', ['Internationalized (punycode) domain', '国際化（Punycode）ドメイン', '국제화(퓨니코드) 도메인']],
  ['導流至私人通訊軟體', ['Redirect to a private messaging service', '個人向けメッセージアプリへの誘導', '개인 메신저로 유도']],
  ['包含外部網址（未自動開啟）', ['External URL (not opened automatically)', '外部URLを含む（自動アクセスなし）', '외부 URL 포함(자동 열기 안 함)']],
  ['疑似網址（非常見網域結尾）', ['Possible URL with an uncommon domain ending', '珍しいドメイン末尾を含むURLらしき文字列', '흔하지 않은 도메인으로 끝나는 URL 의심']],
  ['找到相關查核資料', ['Related fact-checks found.', '関連する検証記事が見つかりました。', '관련 팩트체크 자료를 찾았습니다.']],
  ['尚無查核資料', ['No fact-checks found.', '該当する検証記事はまだありません。', '아직 관련 팩트체크 자료가 없습니다.']],
  ['Cofacts 查詢失敗或逾時，其他分析仍正常進行。', ['The Cofacts search failed or timed out. Other checks continued.', 'Cofactsの照会に失敗したかタイムアウトしました。他の分析は続行しました。', 'Cofacts 조회가 실패했거나 시간이 초과되었습니다. 다른 분석은 진행했습니다.']],
  ['管理員已關閉 Cofacts 查詢（未進行比對，不代表沒有查核資料）', ['Cofacts is disabled by the administrator. No search was run, so relevant reports may still exist.', '管理者がCofacts照会を無効にしています。照合はしておらず、検証記事の有無は不明です。', '관리자가 Cofacts 조회를 껐습니다. 조회를 하지 않았으므로 관련 자료는 있을 수 있습니다.']],
  ['今日查詢次數已達上限，暫停外部查詢', ['Daily limit reached. External searches are paused.', '本日の上限に達したため、外部照会を一時停止しています。', '오늘 조회 한도에 도달해 외부 조회를 일시 중단했습니다.']],
  ['未查詢（使用者選擇不送出或沒有可查詢文字）', ['No search was run because sharing was off or there was no text to search.', '送信が選択されなかったか、照会する文章がなかったため検索していません。', '전송을 선택하지 않았거나 검색할 텍스트가 없어 조회하지 않았습니다.']],
  ['沒有足夠的文字可以搜尋查核報告。', ['There was not enough text to search for fact-check reports.', '検証記事を検索するための文章が足りません。', '팩트체크 보고서를 검색할 텍스트가 부족합니다.']],
  ['今日 Google 查詢次數已達上限。', ['Today’s Google query limit has been reached.', 'Google照会の本日の上限に達しました。', '오늘 Google 조회 한도에 도달했습니다.']],
  ['Google 金鑰沒有啟用 Fact Check Tools API，請到 Google Cloud 主控台啟用。', ['The Fact Check Tools API is disabled for this key. It can be enabled in Google Cloud Console.', 'このキーでFact Check Tools APIが無効になっています。Google Cloudコンソールで有効にしてください。', '이 키에 Fact Check Tools API가 비활성화되어 있습니다. Google Cloud 콘솔에서 활성화하세요.']],
  ['Google 事實查核搜尋失敗或逾時，其他分析照常進行。', ['Google fact-check search failed or timed out. Other checks continued.', 'Googleファクトチェック検索に失敗したかタイムアウトしました。他の分析は続行しました。', 'Google 팩트체크 검색이 실패했거나 시간이 초과되었습니다. 다른 분석은 진행했습니다.']],
  ['用訊息中的關鍵字找到可能相關的查核報告（請自行確認是否為同一件事）。', ['A keyword search found potentially related reports. Check whether they refer to the same event.', 'メッセージのキーワードに関連しそうな検証記事が見つかりました。同じ出来事かご確認ください。', '메시지 키워드로 관련 가능성이 있는 보고서를 찾았습니다. 같은 사건인지 직접 확인하세요.']],
  ['沒有找到相關的查核報告（查無資料不代表沒有風險）。', ['No related fact-checks were found. Risk may still be present.', '関連する検証記事は見つかりませんでした。リスクがないとは限りません。', '관련 팩트체크 보고서를 찾지 못했습니다. 위험이 없다는 뜻은 아닙니다.']],
  ['165 涉詐網站名單暫時無法使用，其他分析照常進行。', ['The 165 fraud site list is temporarily unavailable. Other checks continued.', '165詐欺サイトリストは一時的に利用できません。他の分析は続行しました。', '165 사기 사이트 목록을 일시적으로 사용할 수 없습니다. 다른 분석은 진행했습니다.']],
  ['網址不在 165 涉詐網站名單中（不在名單上不代表安全，新的詐騙網站常常還沒被列入）。', ['No URL matched the 165 list. New scam sites may not yet be listed, so this does not confirm safety.', '165リストに該当するURLはありません。新しい詐欺サイトは未掲載の場合があり、安全とは限りません。', '165 목록에 해당하는 URL이 없습니다. 새 사기 사이트는 아직 목록에 없을 수 있으므로 안전하다는 뜻은 아닙니다.']],
  ['Google 金鑰沒有啟用 Safe Browsing API，請到 Google Cloud 主控台啟用。', ['The Safe Browsing API is disabled for this key. It can be enabled in Google Cloud Console.', 'このキーでSafe Browsing APIが無効になっています。Google Cloudコンソールで有効にしてください。', '이 키에 Safe Browsing API가 비활성화되어 있습니다. Google Cloud 콘솔에서 활성화하세요.']],
  ['Google 安全瀏覽將網址標示為疑似不安全（可能有誤判）。', ['Google Safe Browsing flagged the URL as potentially unsafe. False alarms are possible.', 'Googleセーフブラウジングが危険な可能性のあるURLとして報告しています。誤検出の可能性もあります。', 'Google 세이프 브라우징이 URL을 위험 의심으로 표시했습니다. 잘못 탐지했을 수도 있습니다.']],
  ['Google 安全瀏覽沒有發現已知威脅（可能有漏判，不代表安全）。', ['Google Safe Browsing found no known threats. It can miss threats, so this does not confirm safety.', 'Googleセーフブラウジングで既知の脅威は見つかりませんでした。見落としもあり、安全とは限りません。', 'Google 세이프 브라우징이 알려진 위협을 찾지 못했습니다. 위험을 놓칠 수 있으므로 안전하다는 뜻은 아닙니다.']],
  ['Google 安全瀏覽查詢失敗或逾時，其他分析照常進行。', ['Google Safe Browsing failed or timed out. Other checks continued.', 'Googleセーフブラウジングの照会に失敗したかタイムアウトしました。他の分析は続行しました。', 'Google 세이프 브라우징 조회가 실패했거나 시간이 초과되었습니다. 다른 분석은 진행했습니다.']],
  ['VirusTotal 免費額度已達上限（每分鐘 4 次），請稍後再試。', ['VirusTotal reached its free limit of four requests per minute. Try again later.', 'VirusTotal無料枠の毎分4回の上限に達しました。しばらくしてから再試行してください。', 'VirusTotal 무료 한도(분당 4회)에 도달했습니다. 잠시 후 다시 시도하세요.']],
  ['VirusTotal 金鑰無效，請重新複製 VIRUSTOTAL_API_KEY。', ['The VirusTotal API key is invalid. Recheck VIRUSTOTAL_API_KEY.', 'VirusTotalのキーが無効です。VIRUSTOTAL_API_KEYを再確認してください。', 'VirusTotal 키가 유효하지 않습니다. VIRUSTOTAL_API_KEY를 다시 확인하세요.']],
  ['VirusTotal 免費額度已達上限，請稍後再試。', ['VirusTotal’s free limit has been reached. Try again later.', 'VirusTotal無料枠の上限に達しました。しばらくしてから再試行してください。', 'VirusTotal 무료 한도에 도달했습니다. 잠시 후 다시 시도하세요.']],
  ['VirusTotal 有 2 個以上的資安引擎將網域標示為惡意或可疑（仍可能有誤判）。', ['Two or more VirusTotal engines flagged the domain as malicious or suspicious. False alarms are possible.', 'VirusTotalの2つ以上のエンジンが悪意のある、または不審なドメインと判定しました。誤検出もあり得ます。', 'VirusTotal 보안 엔진 2개 이상이 도메인을 악성 또는 의심으로 표시했습니다. 잘못 탐지했을 수도 있습니다.']],
  ['VirusTotal 查詢失敗或逾時，其他分析照常進行。', ['VirusTotal failed or timed out. Other checks continued.', 'VirusTotalの照会に失敗したかタイムアウトしました。他の分析は続行しました。', 'VirusTotal 조회가 실패했거나 시간이 초과되었습니다. 다른 분석은 진행했습니다.']],
  ['VirusTotal 沒有多個資安引擎將網域標示為惡意（新網站可能還沒有紀錄）。', ['VirusTotal did not find multiple engines flagging this domain as malicious. New sites may have no records yet.', 'VirusTotalで複数のエンジンが悪意ありと判定したドメインはありません。新しいサイトには記録がない場合があります。', 'VirusTotal에서 여러 보안 엔진이 도메인을 악성으로 판정한 기록은 없습니다. 새 사이트는 아직 기록이 없을 수 있습니다.']],
  ['尚未設定 Gemini API 金鑰，AI 分析未啟用。', ['The Gemini API key is not configured. AI analysis is off.', 'Gemini APIキーが未設定のためAI分析は無効です。', 'Gemini API 키가 설정되지 않아 AI 분석이 꺼져 있습니다.']],
  ['你選擇不使用 AI 分析，內容沒有送到 Google。', ['You chose not to use AI analysis. Your content was not sent to Google.', 'AI分析が選択されなかったため、内容はGoogleに送信していません。', 'AI 분석을 선택하지 않아 내용을 Google에 보내지 않았습니다.']],
  ['今日 AI 分析次數已達網站上限（可在管理頁「系統設定」調整）。', ['The site’s daily AI limit was reached. Administrators can adjust it in system settings.', 'サイトのAI分析が本日の上限に達しました。管理画面のシステム設定で調整できます。', '사이트의 오늘 AI 분석 한도에 도달했습니다. 관리 페이지의 시스템 설정에서 조정할 수 있습니다.']],
  ['今天能分析圖片、影片的 AI 模型額度都用完了，請明天再試，或改在補充文字輸入內容。', ['Today’s image and video AI limits have been reached. Try tomorrow or enter the content as additional text.', '画像・動画対応AIモデルの本日の利用枠がなくなりました。明日再試行するか、補足テキストに内容を入力してください。', '이미지와 동영상을 분석할 수 있는 AI 모델의 오늘 사용량이 소진되었습니다. 내일 다시 시도하거나 추가 설명에 내용을 입력하세요.']],
  ['今天所有 AI 模型的免費額度都用完了（或這一分鐘太多人使用），請稍後再試。', ['All free AI models are at their daily or per-minute limits. Try again later.', 'すべての無料AIモデルが1日または1分あたりの上限に達しました。しばらくしてから再試行してください。', '모든 무료 AI 모델이 일일 또는 분당 한도에 도달했습니다. 잠시 후 다시 시도하세요.']],
  ['遭停止解析涉詐網站', ['Suspected scam sites with DNS resolution suspended', '名前解決が停止された詐欺関連サイト', '도메인 연결이 중지된 사기 관련 사이트']],
  ['假投資（博弈）網站', ['Fraudulent investment or gambling sites', '偽投資・賭博サイト', '가짜 투자·도박 사이트']],
  ['疑似惡意軟體', ['Suspected malware', 'マルウェアの疑い', '악성 코드 의심']],
  ['疑似詐騙／釣魚網站', ['Suspected scam or phishing site', '詐欺・フィッシングサイトの疑い', '사기·피싱 사이트 의심']],
  ['疑似有害軟體', ['Suspected harmful software', '有害なソフトウェアの疑い', '유해 소프트웨어 의심']],
  ['疑似可能有害的應用程式', ['Potentially harmful application', '有害な可能性のあるアプリ', '잠재적으로 유해한 앱']],
  ['疑似不安全網站', ['Possibly unsafe site', '危険なサイトの疑い', '안전하지 않은 사이트 의심']],
  // 外部服務錯誤
  ['找不到 API。', ['The requested API was not found.', '指定のAPIが見つかりません。', '요청한 API를 찾을 수 없습니다.']],
  ['伺服器發生錯誤，請稍後再試。', ['A server error occurred. Try again later.', 'サーバーでエラーが発生しました。しばらくしてから再試行してください。', '서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.']],
  ['請求內容不是有效的 JSON。', ['The request was invalid. Reload the page and try again.', 'リクエスト形式が無効です。ページを再読み込みしてから再試行してください。', '요청 형식이 올바르지 않습니다. 페이지를 새로 고친 뒤 다시 시도하세요.']],
  ['Gemini 拒絕了這次請求（模型不支援此檔案格式，或內容被安全機制擋下）。', ['Gemini rejected this request. The model may not support the file format, or safety filters may have blocked the content.', 'Geminiがこのリクエストを拒否しました。モデルがファイル形式に対応していないか、安全機能が内容をブロックした可能性があります。', 'Gemini가 요청을 거부했습니다. 모델이 파일 형식을 지원하지 않거나 안전 필터가 내용을 차단했을 수 있습니다.']],
  ['Gemini API 金鑰無效。', ['The Gemini API key is invalid.', 'Gemini APIキーが無効です。', 'Gemini API 키가 유효하지 않습니다.']],
  ['Gemini API 金鑰沒有權限，請到 Google AI Studio 確認。', ['The Gemini API key lacks permission. Check its settings in Google AI Studio.', 'Gemini APIキーに権限がありません。Google AI Studioで確認してください。', 'Gemini API 키에 권한이 없습니다. Google AI Studio에서 확인하세요.']],
  ['找不到指定的 Gemini 模型，請到管理頁「系統設定」確認模型名稱。', ['The Gemini model was not found. Check its name in the admin system settings.', '指定のGeminiモデルが見つかりません。管理画面のシステム設定でモデル名を確認してください。', '지정한 Gemini 모델을 찾을 수 없습니다. 관리 페이지의 시스템 설정에서 모델 이름을 확인하세요.']],
  ['Gemini 免費額度已用完或請求太頻繁，請稍後再試。', ['Gemini’s free limit was reached or too many requests were made. Try later.', 'Geminiの無料枠の上限、またはリクエスト回数の制限に達しました。しばらくしてから再試行してください。', 'Gemini 무료 사용량이 소진되었거나 요청이 너무 많습니다. 잠시 후 다시 시도하세요.']],
  ['Gemini API 金鑰無效，請重新複製 GEMINI_API_KEY（注意前後不要有空白）。', ['The Gemini API key is invalid. Recheck GEMINI_API_KEY for extra spaces.', 'Gemini APIキーが無効です。GEMINI_API_KEYの前後に空白がないか確認してください。', 'Gemini API 키가 유효하지 않습니다. GEMINI_API_KEY 앞뒤에 공백이 없는지 확인하세요.']],
  ['Google 不支援目前伺服器所在地區使用 Gemini API，請稍後再試。', ['Google does not support the Gemini API in the server’s current region. Try later.', '現在のサーバー地域ではGemini APIが利用できません。しばらくしてから再試行してください。', 'Google이 현재 서버 지역에서 Gemini API를 지원하지 않습니다. 잠시 후 다시 시도하세요.']],
  ['Gemini 回覆格式無法解讀，請再試一次。', ['Could not read Gemini’s response. Try again.', 'Geminiの応答を読み取れませんでした。再試行してください。', 'Gemini 응답을 읽지 못했습니다. 다시 시도하세요.']],
  ['Gemini 回應逾時，請稍後再試或改用較短的影片。', ['Gemini timed out. Try later or use a shorter video.', 'Geminiの応答がタイムアウトしました。しばらくしてから再試行するか、短い動画にしてください。', 'Gemini 응답 시간이 초과되었습니다. 잠시 후 다시 시도하거나 더 짧은 동영상을 사용하세요.']],
  ['無法連線到 Gemini，請確認網路。', ['Cannot connect to Gemini. Check the connection.', 'Geminiに接続できません。通信状況を確認してください。', 'Gemini에 연결할 수 없습니다. 네트워크를 확인하세요.']],
  ['Gemini 服務暫時無法使用。', ['Gemini is temporarily unavailable.', 'Geminiは一時的に利用できません。', 'Gemini를 일시적으로 사용할 수 없습니다.']],
  ['Gemini 沒有完成分析（可能被安全機制擋下）。', ['Gemini did not complete the analysis. Its safety filters may have blocked the content.', 'Geminiの分析が完了しませんでした。安全機能が内容をブロックした可能性があります。', 'Gemini가 분석을 완료하지 못했습니다. 안전 필터가 차단했을 수 있습니다.']],
  ['Gemini 沒有回傳上傳網址。', ['Gemini did not return an upload URL.', 'Geminiからアップロード用URLが返されませんでした。', 'Gemini가 업로드 URL을 반환하지 않았습니다.']],
  ['Gemini 上傳回應缺少檔案資訊。', ['Gemini’s upload response was missing file details.', 'Geminiのアップロード応答にファイル情報がありません。', 'Gemini 업로드 응답에 파일 정보가 없습니다.']],
  ['Gemini 無法處理這部影片，請換一個檔案或改用補充文字。', ['Gemini could not process the video. Try another file or enter additional text.', 'Geminiが動画を処理できませんでした。別のファイルを選ぶか、補足テキストを入力してください。', 'Gemini가 동영상을 처리하지 못했습니다. 다른 파일을 선택하거나 추가 설명을 입력하세요.']],
  ['Gemini 處理影片逾時，請改用較短的影片。', ['Gemini timed out while processing this video. Try a shorter one.', 'Geminiの動画処理がタイムアウトしました。短い動画をお試しください。', 'Gemini 동영상 처리 시간이 초과되었습니다. 더 짧은 동영상을 사용하세요.']],
  // 模型切換原因
  ['這一分鐘的次數已滿', ['per-minute limit reached', '1分あたりの上限に到達', '분당 한도 도달']],
  ['今日額度已用完', ['daily limit reached', '本日の上限に到達', '오늘 사용량 소진']],
  ['超過 3 分鐘沒有回應', ['no response after 3 minutes', '3分間応答なし', '3분 동안 응답 없음']],
  ['暫時太多人使用', ['temporarily busy', '一時的に混雑', '일시적으로 사용량이 많음']],
  ['無法使用', ['unavailable', '利用不可', '사용 불가']],
])

// 數字、檔案大小、網域及伺服器回傳的欄位名稱沿用原值。
const templates: [RegExp, Translations][] = [
  [/^檔案超過 (\d+) MB 上限（目前 ([\d.]+) MB）。$/, ['The file is $2 MB. Choose a file no larger than $1 MB.', 'ファイルは$2 MBです。$1 MB以下のファイルを選んでください。', '파일 크기는 $2 MB입니다. $1 MB 이하의 파일을 선택하세요.']],
  [/^影片長度 (\d+) 秒，超過 (\d+) 秒上限，請剪輯後再上傳。$/, ['The video is $1 seconds long. Trim it to $2 seconds or less and upload again.', '動画は$1秒です。$2秒以内に切り取ってからアップロードしてください。', '동영상 길이는 $1초입니다. $2초 이하로 잘라 다시 올려 주세요.']],
  [/^檔案超過 (\d+) MB 上限，請壓縮或裁切後再上傳。$/, ['The file exceeds $1 MB. Compress or trim it and upload again.', 'ファイルが$1 MBを超えています。圧縮または切り取ってからアップロードしてください。', '파일이 $1 MB를 초과합니다. 압축하거나 자른 뒤 다시 올려 주세요.']],
  [/^有 (\d+) 個網址列在警政署 165 涉詐網站名單中，請不要開啟。$/, ['URLs on Taiwan police’s 165 fraud site list: $1. Do not open them.', '台湾警察の165詐欺サイトリストにあるURLは$1件です。開かないでください。', '대만 경찰청 165 사기 사이트 목록에 URL $1개가 있습니다. 열지 마세요.']],
  [/^VirusTotal 有 (\d+) 個資安引擎判定網域惡意$/, ['VirusTotal security engines that flagged the domain as malicious: $1.', 'VirusTotalの$1個のエンジンが悪意のあるドメインと判定しました。', 'VirusTotal 보안 엔진 $1개가 도메인을 악성으로 판정했습니다.']],
  [/^(\d+) 個資安引擎中有 (\d+) 個判定惡意、(\d+) 個判定可疑$/, ['Of $1 engines, $2 flagged it as malicious and $3 as suspicious.', '$1個のエンジンのうち$2個が悪意あり、$3個が不審と判定しました。', '보안 엔진 $1개 중 $2개가 악성, $3개가 의심으로 판정했습니다.']],
  [/^縮網址（([^（）]+)）$/, ['Short link ($1)', '短縮URL（$1）', '단축 URL($1)']],
  [/^較常被濫用的網域結尾（([^（）]+)）$/, ['Commonly abused domain ending ($1)', '悪用されやすいドメイン末尾（$1）', '자주 악용되는 도메인 끝자리($1)']],
  [/^Google 安全瀏覽暫時無法使用（(\d+)）。$/, ['Google Safe Browsing is temporarily unavailable ($1).', 'Googleセーフブラウジングは一時的に利用できません（$1）。', 'Google 세이프 브라우징을 일시적으로 사용할 수 없습니다($1).']],
  [/^Google 事實查核搜尋暫時無法使用（(\d+)）。$/, ['Google fact-check search is temporarily unavailable ($1).', 'Googleファクトチェック検索は一時的に利用できません（$1）。', 'Google 팩트체크 검색을 일시적으로 사용할 수 없습니다($1).']],
  [/^Gemini 服務暫時無法使用（(\d+)）。$/, ['Gemini is temporarily unavailable ($1).', 'Geminiは一時的に利用できません（$1）。', 'Gemini를 일시적으로 사용할 수 없습니다($1).']],
  [/^發生錯誤（(\d+)），請稍後再試。$/, ['An error occurred ($1). Try again later.', 'エラーが発生しました（$1）。しばらくしてから再試行してください。', '오류가 발생했습니다($1). 잠시 후 다시 시도하세요.']],
  [/^輸入格式不正確：(.+)$/, ['The input format is invalid. Check these fields: $1.', '入力形式が正しくありません。次の項目を確認してください：$1。', '입력 형식이 올바르지 않습니다. 다음 항목을 확인하세요: $1.']],
]

export function checkMessage(t: Translate, value: string): string {
  const fixed = phrases.get(value)
  if (fixed) return t(value, ...fixed)

  for (const [pattern, translations] of templates) {
    const match = pattern.exec(value)
    if (match) {
      const template = t(value, ...translations)
      return template === value ? value : template.replace(/\$(\d)/g, (_, index: string) => match[Number(index)])
    }
  }

  // 結論與歷史紀錄可能包含觸發字。訊息中實際出現的詞必須保留原文。
  const reason = /^([^（）]+)（(.*)）$/.exec(value)
  const basis = /^偵測到「([^」]+)」：(.*)$/.exec(value)
  const feature = basis ?? reason
  if (feature && phrases.has(feature[1])) {
    const label = checkMessage(t, feature[1])
    const evidence = feature[2].split('、').map((part) => checkMessage(t, part)).join(t('、', ', ', '、', ', '))
    return basis
      ? t(value, `Detected “${label}”: ${evidence}`, `「${label}」に一致：${evidence}`, `‘${label}’ 감지: ${evidence}`)
      : t(value, `${label} (${evidence})`, `${label}（${evidence}）`, `${label}(${evidence})`)
  }

  const switched = /^已自動改用 (.+?)（(.+)）$/.exec(value)
  if (switched) {
    const reasons = switched[2].split('；').map((item) => {
      // 有些原因含空白（例如三分鐘逾時），從模型名稱後找完整片語。
      const suffix = ['這一分鐘的次數已滿', '今日額度已用完', '超過 3 分鐘沒有回應', '暫時太多人使用', '無法使用'].find((why) => item.endsWith(' ' + why))
      return suffix ? `${item.slice(0, -suffix.length)}${checkMessage(t, suffix)}` : item
    }).join(t('；', '; ', '、', ', '))
    const model = switched[1]
    return t(value, `Switched to ${model} (${reasons})`, `${model}に自動切替（${reasons}）`, `${model}(으)로 자동 전환(${reasons})`)
  }

  // Google 自身的錯誤細節照原文呈現。
  const google = /^(.+?)（Google 訊息：([\s\S]+)）$/.exec(value)
  if (google) {
    const detail = google[2]
    const summary = checkMessage(t, google[1])
    return t(value, `${summary} (Google: ${detail})`, `${summary}（Google：${detail}）`, `${summary} (Google: ${detail})`)
  }

  return value
}
