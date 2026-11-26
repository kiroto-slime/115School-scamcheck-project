import { Link } from 'react-router-dom'
import { useLanguage } from '../language'
import './home.css'

export default function ParcelGuide() {
  const { t } = useLanguage()
  return (
    <article className="card home-example parcel-guide">
      <Link to="/" className="guide-back">{t('回首頁', 'Back to home', 'ホームへ戻る', '홈으로 돌아가기')}</Link>

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
      <Link to="/check" className="btn-primary guide-check">{t('查核自己的訊息', 'Check your own message', '自分のメッセージを確認する', '내 메시지 확인하기')}</Link>
    </article>
  )
}
