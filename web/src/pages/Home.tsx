import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PublicFaq } from '../components/PublicGuideContent'
import { useHealth } from '../components/ui'
import { useLanguage } from '../language'
import './home.css'
import { fitFontSize } from '../svgText'

function HomeIcon({ kind }: { kind: 'check' | 'research' | 'parcel' | 'arrow' }) {
  const paths = {
    check: 'M21 21l-5.1-5.1M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15',
    research: 'M12 5v15M12 5C8 2 4 3 2 4v15c3-2 7-2 10 1 3-3 7-3 10-1V4c-3-1-7-2-10 1',
    parcel: 'm3 7 9-4 9 4v10l-9 5-9-5zM3 7l9 5 9-5M12 12v10M7.5 5l9 5',
    arrow: 'M4 12h15m-6-6 6 6-6 6',
  }
  return <svg className="home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}

/** 卡片上的一行通知文字：先依字數估算字級，畫出來仍超出寬度時再精確壓縮到寬度內。 */
function FitText({ text, base, width, ...props }: { text: string; base: number; width: number; x: number; y: number; fontWeight: string; textAnchor?: 'middle' }) {
  const ref = useRef<SVGTextElement>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.removeAttribute('textLength')
    node.removeAttribute('lengthAdjust')
    // 測試環境（jsdom）沒有這個量測方法，就只用估算字級。
    if (typeof node.getComputedTextLength === 'function' && node.getComputedTextLength() > width) {
      node.setAttribute('textLength', String(width))
      node.setAttribute('lengthAdjust', 'spacingAndGlyphs')
    }
  }, [text, base, width])
  return <text ref={ref} {...props} fontSize={fitFontSize(text, base, width)}>{text}</text>
}

function ParcelPhoto() {
  const { lang, t } = useLanguage()
  return (
    <div className="parcel-visual" role="img" aria-label={t('窗邊的包裹旁，手機收到一則要求確認地址的通知。')}>
      <div className="parcel-photo">
        {/* 通知文字使用與底圖相同的座標系統，縮放和切換語言時仍貼合手機螢幕。 */}
        <svg aria-hidden="true" className="parcel-screen" viewBox="0 0 1536 1024">
          <g transform="matrix(1 .085 -.13 1 1141 385)">
            <rect className="parcel-screen-card" width="261" height="191" rx="27" />
            <path className="parcel-screen-card" d="m19 176-6 26 32-16z" />
            <rect x="17" y="31" width="53" height="52" rx="13" fill="#8bb99d" />
            <path fill="white" d="M60 55c0 8-7 14-17 14h-4l-7 4 2-7c-5-2-8-6-8-11 0-8 7-13 17-13s17 5 17 13z" />
            <g fill="#8bb99d"><circle cx="35" cy="55" r="2" /><circle cx="43" cy="55" r="2" /><circle cx="51" cy="55" r="2" /></g>
            <FitText x={80} y={68} fontWeight="650" text={t('包裹通知')} base={lang === 'en' ? 25 : 31} width={175} />
            <path className="parcel-screen-line" d="M22 99h216" />
            <FitText x={130} y={148} textAnchor="middle" fontWeight="550" text={t('地址需要確認')} base={lang === 'en' ? 25 : 30} width={216} />
          </g>
        </svg>
      </div>
    </div>
  )
}

export default function Home() {
  const { t } = useLanguage()
  const { health } = useHealth()
  const limits = health?.limits
  const textLimit = limits?.max_text_chars ?? 10000
  const imageMB = limits?.max_image_mb ?? 10
  const videoMB = limits?.max_video_mb ?? 20
  const seconds = limits?.max_video_seconds ?? 30
  const gemini = health?.modes.ai === 'gemini'

  return (
    <div className="home-page">
      <section className="home-hero">
        <ParcelPhoto />
        <div className="home-intro">
          <h1>{t('識詐數據庫')}</h1>
          <p className="home-lead">{t('收到「包裹地址有誤」的簡訊？')}</p>
          <p className="home-description">{t('點連結前，先查一查。貼上可疑訊息、截圖或短片，免費查看有哪些地方值得留意。')}</p>
          <div className="home-actions">
            <Link to="/check" className="btn-primary"><HomeIcon kind="check" />{t('開始防詐查核')}</Link>
            <Link to="/research" className="btn-secondary home-research-link"><HomeIcon kind="research" />{t('參加匿名研究測驗')}</Link>
          </div>
        </div>
      </section>

      <section id="parcel-example" aria-labelledby="parcel-example-title" className="card home-guide-preview">
        <span className="home-parcel-icon"><HomeIcon kind="parcel" /></span>
        <div>
          <h2 id="parcel-example-title">{t('公開範例：包裹簡訊')}</h2>
          <p>{t('先用一則虛構簡訊練習找警訊。閱讀範例無須提供自己的訊息，也不會留下研究紀錄。')}</p>
        </div>
        <Link to="/guides/parcel-message" className="home-example-link">{t('閱讀範例')}<HomeIcon kind="arrow" /></Link>
      </section>

      <PublicFaq t={t} />

      <details className="card home-disclosure">
        <summary>{t('研究計畫')}</summary>
        <p>{t('本專題由三重商工資料處理科學生製作。我們想了解哪些詐騙特徵容易被忽略。你會先自行判斷一則模擬訊息，使用指定的查核輔助後，再判斷另一則難度相近的訊息。')}</p>
        <p>{t('參與前會徵求同意，作答以匿名編號記錄。你可以隨時撤回同意或刪除研究資料。')} <Link to="/privacy">{t('隱私與研究說明')}</Link></p>
      </details>

      <details className="card home-disclosure">
        <summary>{t('查看更多：功能與限制')}</summary>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t('文字最多 {0} 字。規則分析會標出可疑特徵，你也可以選擇與 Cofacts「真的假的」公開查核資料比對。', textLimit)}</li>
          <li>{t('圖片支援 JPG、PNG、WebP，上限 {0} MB。', imageMB)}{gemini ? t('選用 Gemini 可讀取圖片及圖中文字，AI 可能判讀錯誤。') : t('AI 未啟用時，請手動輸入圖片中的文字。')}</li>
          <li>{t('影片支援 MP4、MOV，上限 {0} MB、{1} 秒。', videoMB, seconds)}{gemini ? t('勾選 AI 分析，Gemini 才會分析畫面與聲音。') : t('AI 未啟用時，請手動輸入旁白或畫面重點。')}</li>
          <li>{t('風險指數（0–100）是規則加權分數，不是詐騙機率或司法認定。Cofacts 查無資料不代表安全，比對到相似訊息也未必是同一事件。')}</li>
          <li>{t('Google Gemini 需由網站管理者設定。只有你勾選 AI 分析時，內容才會傳給 Google。')}</li>
          <li>{t('網站架設於 Cloudflare。圖片與影片只做暫時處理。只有同意研究，才會保存遮蔽個資後的研究文字。')}</li>
        </ul>
      </details>
    </div>
  )
}
