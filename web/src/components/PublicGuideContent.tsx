import type { Copy } from '../language'

type Props = { t: (...copy: Copy) => string }

export function ParcelGuideContent({ t }: Props) {
  return (
    <>
      <h1>{t('包裹地址有誤？認識假冒物流簡訊', 'Wrong delivery address? Spotting a fake parcel text', '「住所不備」？ 配送を装うSMSの見分け方', '배송 주소 오류? 가짜 배송 문자 알아보기')}</h1>

      <p>{t('這是虛構的教學簡訊。你可以直接看範例，無須提供自己的訊息，也不會留下查核或研究紀錄。', 'This text was written for practice. You can read it without sharing a message of your own or creating a check or research record.', '学習用に作成した架空のSMSです。自分のメッセージを入力する必要はなく、閲覧してもチェック履歴や研究記録は残りません。', '연습을 위해 만든 가상의 문자입니다. 자신의 메시지를 입력할 필요가 없으며, 예시를 봐도 확인 내역이나 연구 기록이 남지 않습니다.')}</p>
      <blockquote>{t('「您的包裹因地址不完整暫停配送。請在今天內開啟簡訊連結更新地址，並支付新臺幣 12 元重新配送費，逾時將退件。」', '“Your parcel is on hold because your address is incomplete. Open the link in this text today to update your address and pay NT$12 for redelivery, or your parcel will be returned.”', '「住所不備のため配達を保留しています。本日中にSMSのリンクから住所を更新し、再配達料12台湾ドルをお支払いください。期限を過ぎると返送されます。」', '“주소가 불완전하여 배송이 보류되었습니다. 오늘 중으로 문자에 있는 링크에서 주소를 수정하고 재배송비 12대만달러를 결제해 주세요. 기한이 지나면 반송됩니다.”')}</blockquote>
      <section className="home-example-answer">
        <h2>{t('這則簡訊有哪些警訊？', 'What are the warning signs?', 'このSMSのどこに注意すべき？', '어떤 점을 주의해야 할까요?')}</h2>
        <p>{t('「今天內」和「逾時退件」催你趕快行動，小額費用又讓人容易放下戒心。它還要求你從簡訊連結輸入地址和付款資料，卻沒提供能和原始訂單核對的包裹編號。', 'The same-day deadline and threat of a return pressure you to act quickly. The small fee can make the request sound harmless. It asks for your address and payment through a link but gives no tracking number you can match to your order.', '「本日中」「期限を過ぎると返送」という言葉で判断を急がせ、少額の料金で警戒心を弱めようとしています。さらに、注文と照合できる追跡番号を示さず、リンク先で住所の入力や支払いを求めています。', '“오늘 중”이라는 기한과 반송 경고는 결정을 재촉합니다. 소액이라 안심하고 결제하기도 쉽습니다. 주문 내역과 대조할 운송장 번호는 제시하지 않으면서 링크에서 주소를 입력하고 결제하도록 요구합니다.')}</p>
      </section>
      <section className="home-example-answer">
        <h2>{t('怎麼查證包裹？', 'How can I check the delivery?', '荷物の状況を確認するには？', '배송 상태는 어떻게 확인하나요?')}</h2>
        <p>{t('從購物 App 的訂單頁找出物流公司和寄件編號，再到該公司的官方網站核對。如果找不到對應的訂單，請使用購物平台原有的客服管道詢問。', 'Find the carrier and tracking number in the order details of the shopping app. Use that number on the carrier’s official website. If you cannot find a matching order, contact support through the shopping platform.', '購入したアプリの注文詳細で配送会社と追跡番号を確認し、その会社の公式サイトで照合します。該当する注文が見つからない場合は、購入先の問い合わせ窓口を利用しましょう。', '쇼핑 앱 주문 내역에서 배송업체와 운송장 번호를 찾은 뒤 해당 업체의 공식 사이트에서 조회하세요. 일치하는 주문이 없다면 쇼핑 플랫폼의 고객센터에 문의하세요.')}</p>
      </section>
    </>
  )
}

export function PublicFaq({ t }: Props) {
  return (
    <section className="card home-disclosure" aria-labelledby="check-faq-title">
      <h2 id="check-faq-title">{t('查核常見問題', 'Common questions about checks', '確認ツールのよくある質問', '검사에 대해 자주 묻는 질문')}</h2>
      <details className="border-b border-slate-200">
        <summary className="min-h-11 py-3 font-medium">{t('查不到紀錄，這個連結就能點嗎？', 'Is a link safe to open if there’s no match?', '該当する情報がなければリンクを開いても大丈夫ですか？', '검색 결과가 없으면 링크를 열어도 되나요?')}</summary>
        <p className="pb-3">{t(
          '新的詐騙網址可能還沒列入 165 涉詐網站公開名單。勾選 Cofacts 時，網站也會比對已有的公開查核訊息。即使都查不到，仍可能有風險，請先從你平常使用的 App 或官方網站核對。',
          'A new scam site may not yet appear on Taiwan’s public 165 list. If you select Cofacts, the tool also looks for public fact-checks of similar messages. An unlisted link can still be risky. Check through the app you usually use or the official website.',
          '新しい詐欺サイトは、台湾の165公開リストにまだ載っていないことがあります。Cofactsを選ぶと、類似のメッセージに関する公開の検証記事も調べます。どちらにも該当しなくても危険は残るので、普段使っているアプリや公式サイトで確認してください。',
          '새로운 사기 사이트는 대만 165 공개 목록에 아직 없을 수 있습니다. Cofacts를 선택하면 비슷한 메시지에 대한 공개 팩트체크 자료도 확인합니다. 두 곳에서 모두 찾을 수 없어도 위험할 수 있으니 평소 사용하는 앱이나 공식 웹사이트에서 먼저 확인하세요.',
        )}</p>
      </details>
      <details>
        <summary className="min-h-11 py-3 font-medium">{t('我上傳的截圖會傳給誰？', 'Who receives my screenshot?', '送信したスクリーンショットは誰に届きますか？', '올린 스크린샷은 어디로 전송되나요?')}</summary>
        <p>{t(
          '送出時，截圖會先傳到本站處理。只有勾選 Gemini 分析時，網站才會把圖片送給 Google。關閉這個選項後，你可以在「補充文字」貼上圖中的文字來查核。上傳前請先遮住姓名、電話和驗證碼。',
          'When you submit a screenshot, it goes to this site for processing. The site sends the image to Google only if Gemini analysis is selected. With that option off, paste the text from the image into the notes field for checking. Cover names, phone numbers and verification codes before uploading.',
          '送信した画像は、まず当サイトで処理します。画像をGoogleに送るのはGeminiの分析を選んだ場合だけです。選択を外した場合は、補足の入力欄に画像内の文字を貼り付けて確認できます。送信前に氏名、電話番号、認証コードを隠してください。',
          '제출한 이미지는 먼저 이 사이트에서 처리합니다. Gemini 분석을 선택했을 때만 이미지를 Google로 보냅니다. 이 옵션을 끄면 추가 설명란에 이미지 속 글자를 붙여 넣어 검사할 수 있습니다. 올리기 전에 이름, 전화번호, 인증 코드를 가려 주세요.',
        )}</p>
      </details>
    </section>
  )
}
