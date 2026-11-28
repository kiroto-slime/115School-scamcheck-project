
type Props = { t: (zh: string) => string }

export function ParcelGuideContent({ t }: Props) {
  return (
    <>
      <h1>{t('包裹地址有誤？認識假冒物流簡訊')}</h1>

      <p>{t('這是虛構的教學簡訊。你可以直接看範例，無須提供自己的訊息，也不會留下查核或研究紀錄。')}</p>
      <blockquote>{t('「您的包裹因地址不完整暫停配送。請在今天內開啟簡訊連結更新地址，並支付新臺幣 12 元重新配送費，逾時將退件。」')}</blockquote>
      <section className="home-example-answer">
        <h2>{t('這則簡訊有哪些警訊？')}</h2>
        <p>{t('「今天內」和「逾時退件」催你趕快行動，小額費用又讓人容易放下戒心。它還要求你從簡訊連結輸入地址和付款資料，卻沒提供能和原始訂單核對的包裹編號。')}</p>
      </section>
      <section className="home-example-answer">
        <h2>{t('怎麼查證包裹？')}</h2>
        <p>{t('從購物 App 的訂單頁找出物流公司和寄件編號，再到該公司的官方網站核對。如果找不到對應的訂單，請使用購物平台原有的客服管道詢問。')}</p>
      </section>
    </>
  )
}

export function PublicFaq({ t }: Props) {
  return (
    <section className="card home-disclosure" aria-labelledby="check-faq-title">
      <h2 id="check-faq-title">{t('查核常見問題')}</h2>
      <details className="border-b border-slate-200">
        <summary className="min-h-11 py-3 font-medium">{t('查不到紀錄，這個連結就能點嗎？')}</summary>
        <p className="pb-3">{t('新的詐騙網址可能還沒列入 165 涉詐網站公開名單。勾選 Cofacts 時，網站也會比對已有的公開查核訊息。即使都查不到，仍可能有風險，請先從你平常使用的 App 或官方網站核對。')}</p>
      </details>
      <details>
        <summary className="min-h-11 py-3 font-medium">{t('我上傳的截圖會傳給誰？')}</summary>
        <p>{t('送出時，截圖會先傳到本站處理。只有勾選 Gemini 分析時，網站才會把圖片送給 Google。關閉這個選項後，你可以在「補充文字」貼上圖中的文字來查核。上傳前請先遮住姓名、電話和驗證碼。')}</p>
      </details>
    </section>
  )
}
