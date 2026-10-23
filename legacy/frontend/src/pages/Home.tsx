import { Link } from 'react-router-dom'
import { useHealth } from '../components/ui'

export default function Home() {
  const { health } = useHealth()
  const m = health?.modes
  const l = health?.limits
  return (
    <div className="space-y-4">
      <section className="card space-y-3 bg-gradient-to-br from-teal-50 to-white">
        <h1>識詐數據庫</h1>
        <p className="text-slate-700">
          結合 Cofacts 公開查核資料與可解釋的規則分析，協助青少年判斷網路訊息、購物廣告與交易的風險，
          並以匿名研究了解「哪些詐騙特徵最容易被忽略」。
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to="/check" className="btn-primary no-underline hover:no-underline">開始防詐查核</Link>
          <Link to="/research" className="btn-secondary no-underline hover:no-underline">參加匿名研究測驗</Link>
        </div>
      </section>

      <section className="card space-y-2">
        <h2>研究計畫</h2>
        <p>
          本專題為臺灣技術型高中資料處理科學生團隊的商業與管理群專題。研究測驗會請你先自行判斷一則模擬訊息，
          再看過指定的查核輔助後判斷另一則難度相同的訊息，以比較不同輔助方式的效果。
          研究資料採匿名編號、需你主動同意，可隨時撤回與刪除。詳見 <Link to="/privacy">隱私與研究說明</Link>。
        </p>
      </section>

      <section className="card space-y-2">
        <h2>功能與限制</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm sm:text-base">
          <li>文字：規則分析＋（設定憑證後）Cofacts 查核比對。上限 {l?.max_text_chars ?? 10000} 字。</li>
          <li>
            圖片：JPG / PNG / WebP，{l?.max_image_mb ?? 10} MB 以內，以 OCR 擷取文字
            {m && m.ocr !== 'available' && '（目前伺服器未安裝 OCR，需手動輸入文字）'}。OCR 可能有錯字。
          </li>
          <li>
            影片：MP4 / MOV，{l?.max_video_mb ?? 20} MB、{l?.max_video_seconds ?? 30} 秒以內。擷取關鍵影格做文字辨識；
            {m?.ai === 'gemini' ? '勾選 AI 分析時，Gemini 會分析影片畫面與聲音。' : <><strong>未設定 AI 時不分析語音與影片語意</strong>，可手動補充旁白重點。</>}
          </li>
          <li>風險指數（0–100）是規則加權分數，<strong>不是詐騙機率</strong>，也不是司法認定。</li>
          <li>Cofacts 查無資料不代表安全；相似資料也不等於同一事件。</li>
          <li>AI 分析：設定 Google Gemini API 金鑰後啟用，可分析文字、圖片與影片（含聲音）。內容會傳送到 Google，使用者可自行選擇不使用。</li>
          <li>上傳的文字、圖片、影片只做暫時處理，本網站不永久保存。</li>
        </ul>
      </section>
    </div>
  )
}
