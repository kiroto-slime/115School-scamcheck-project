import { useEffect, useRef, useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { FloatingTools } from './components/FloatingTools'
import { AccentMenu } from './components/AccentMenu'
import { Navigation } from './components/Navigation'
import { ChatPanel } from './components/ChatPanel'
import { SupportBall } from './components/SupportBall'
import Home from './pages/Home'
import ParcelGuide from './pages/ParcelGuide'
import Check from './pages/Check'
import Result from './pages/Result'
import Research from './pages/Research'
import Privacy from './pages/Privacy'
import Products from './pages/Products'
import Admin from './pages/Admin'
import History from './pages/History'
import Game from './pages/Game'
import { useTheme } from './prefs'
import { LanguageProvider, useLanguage } from './language'
import { LanguageMenu } from './components/LanguageMenu'
import { pageHead, SOURCE_URL } from './pageMetadata'

function Icon({ d, className = 'h-6 w-6' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const SUN = 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8'
const MOON = 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5'

function ThemeButton() {
  const { t } = useLanguage()
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button className="header-button" onClick={toggle}
      aria-label={dark ? t('切換成淺色模式', 'Switch to light mode', 'ライトモードに切り替える', '밝은 모드로 전환') : t('切換成深色模式', 'Switch to dark mode', 'ダークモードに切り替える', '어두운 모드로 전환')}
      title={dark ? t('淺色模式', 'Light mode', 'ライトモード', '밝은 모드') : t('深色模式', 'Dark mode', 'ダークモード', '어두운 모드')}>
      <Icon d={dark ? SUN : MOON} />
    </button>
  )
}

export default function App() {
  return <LanguageProvider><Site /></LanguageProvider>
}

const portraitNav = '(max-width: 767px) and (orientation: portrait)'
const landscapeNav = '(max-width: 1180px) and (max-height: 600px) and (orientation: landscape)'

function navigationLayout() {
  if (window.matchMedia(portraitNav).matches) return 'portrait'
  return window.matchMedia(landscapeNav).matches ? 'landscape' : 'standard'
}

function Site() {
  const { lang, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [ballEnabled, setBallEnabled] = useState(() => {
    try { return localStorage.getItem('mobileSupportBall') === 'on' } catch { return false }
  })
  const toggleBall = () => {
    setBallEnabled(!ballEnabled)
    try { localStorage.setItem('mobileSupportBall', ballEnabled ? 'off' : 'on') } catch { /* 此次使用仍可切換。 */ }
  }
  const [pinnedChoice, setPinnedChoice] = useState<boolean | null>(null)
  const [layout, setLayout] = useState(navigationLayout)
  const [peek, setPeek] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const edgeHandle = useRef<HTMLButtonElement>(null)
  const sidebar = useRef<HTMLElement>(null)
  const returnFocus = useRef(false)
  const keyboardOpen = useRef(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const header = useRef<HTMLElement>(null)
  const loc = useLocation()
  useEffect(() => {
    const fragment = document.createDocumentFragment()
    for (const { tag, attrs, text } of pageHead(loc.pathname, t)) {
      const element = document.createElement(tag)
      element.setAttribute('data-page-head', '')
      for (const [name, value] of Object.entries(attrs ?? {})) element.setAttribute(name, value)
      if (text) element.textContent = text
      fragment.append(element)
    }
    document.head.querySelectorAll('[data-page-head]').forEach(element => element.remove())
    document.head.append(fragment)
  }, [loc.pathname, t])
  const pinned = layout === 'portrait' || (pinnedChoice ?? !(layout === 'landscape' && loc.pathname === '/game'))
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }
  const reveal = () => { cancelClose(); setPeek(true) }
  const closePeek = (restoreFocus = false) => {
    cancelClose()
    returnFocus.current = restoreFocus || !!sidebar.current?.contains(document.activeElement)
    setPeek(false)
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => closePeek(), 250)
  }
  useEffect(() => {
    const queries = [portraitNav, landscapeNav].map(query => window.matchMedia(query))
    const update = () => { setLayout(navigationLayout()); setOpen(false); setPeek(false) }
    for (const query of queries) query.addEventListener('change', update)
    return () => {
      for (const query of queries) query.removeEventListener('change', update)
      cancelClose()
    }
  }, [])
  useEffect(() => {
    if (!peek) {
      if (returnFocus.current) { edgeHandle.current?.focus(); returnFocus.current = false }
      return
    }
    const focusFrame = keyboardOpen.current
      ? requestAnimationFrame(() => sidebar.current?.querySelector<HTMLAnchorElement>('a')?.focus())
      : undefined
    keyboardOpen.current = false
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePeek(true)
    }
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('keydown', escape)
      if (focusFrame !== undefined) cancelAnimationFrame(focusFrame)
    }
  }, [peek, focusRequest])
  useEffect(() => {
    setOpen(false)
    closePeek()
    window.scrollTo(0, 0)
  }, [loc.pathname])

  useEffect(() => {
    const measure = () => document.documentElement.style.setProperty('--topbar-height', `${header.current?.offsetHeight ?? 64}px`)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    if (header.current) observer.observe(header.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={`app-shell ${pinned ? 'nav-pinned' : 'nav-auto'} ${peek ? 'nav-peek' : ''}`}>
      <header ref={header} className="topbar">
        <div className="topbar-content">
          <div className="brand-controls">
            <Link to="/" className="brand">
            <span className="brand-symbol"><img src="/favicon.svg" alt="" /></span>
            {t('識詐數據庫', 'ScamCheck', '詐欺チェック', '사기 확인')}
            </Link>
            <button className="header-button sidebar-toggle" aria-controls="sidebar-panel" aria-pressed={!pinned}
            aria-label={pinned ? t('將導覽列設為自動隱藏', 'Auto-hide navigation', 'ナビゲーションを自動で隠す', '탐색 메뉴 자동 숨기기') : t('將導覽列設為常駐', 'Pin navigation', 'ナビゲーションを固定する', '탐색 메뉴 고정')}
            title={pinned ? t('自動隱藏導覽列', 'Auto-hide navigation', '自動で隠す', '자동 숨기기') : t('常駐導覽列', 'Pin navigation', '固定する', '메뉴 고정')}
            onClick={() => { setPinnedChoice(!pinned); setOpen(false); closePeek() }}>
            <Icon d={pinned ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <AccentMenu />
            <ThemeButton />
            <button
              className="header-button mobile-menu-toggle"
              aria-expanded={open}
              aria-controls="main-nav"
              aria-label={open ? t('關閉選單', 'Close menu', 'メニューを閉じる', '메뉴 닫기') : t('開啟選單', 'Open menu', 'メニューを開く', '메뉴 열기')}
              onClick={() => setOpen((v) => !v)}
            >
              <Icon d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
            </button>
          </div>
        </div>
        {/* 手機：漢堡選單展開 */}
        <Navigation mobile open={pinned && open} ballEnabled={ballEnabled} onToggleBall={toggleBall} />
      </header>

      <div className="flex flex-1">
        {/* 電腦：左側導覽列 */}
        {!pinned && <>
          {peek && <button className="sidebar-backdrop" aria-label={t('關閉左側導覽列', 'Close navigation', 'ナビゲーションを閉じる', '탐색 메뉴 닫기')} tabIndex={-1}
            onClick={() => closePeek(true)} />}
          <div className="sidebar-edge" aria-hidden="true"
            onPointerEnter={(event) => { if (event.pointerType === 'mouse') reveal() }}
            onPointerLeave={(event) => { if (event.pointerType === 'mouse') scheduleClose() }} />
          <button ref={edgeHandle} className="sidebar-handle" aria-controls="sidebar-panel" aria-expanded={peek}
            aria-label={t('展開左側導覽列', 'Open navigation', 'ナビゲーションを開く', '탐색 메뉴 열기')} onClick={(event) => {
              keyboardOpen.current = event.detail === 0
              if (keyboardOpen.current) setFocusRequest((value) => value + 1)
              reveal()
            }}>
            <Icon d="M9 5l7 7-7 7" />
          </button>
        </>}
        <aside ref={sidebar} id="sidebar-panel" className="sidebar" aria-hidden={!pinned && !peek}
          onPointerEnter={cancelClose}
          onPointerLeave={(event) => { if (!pinned && event.pointerType === 'mouse') scheduleClose() }}
          onBlur={(event) => { if (!pinned && !event.currentTarget.contains(event.relatedTarget as Node | null)) closePeek() }}>
          <Navigation ballEnabled={ballEnabled} onToggleBall={toggleBall} />
        </aside>

        <div className="content-column flex min-w-0 flex-1 flex-col">
          <main className="main-content space-y-5">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/guides/parcel-message" element={<ParcelGuide />} />
              <Route path="/check" element={<Check />} />
              <Route path="/result/:id" element={<Result key={loc.pathname} />} />
              <Route path="/history" element={<History />} />
              <Route path="/research" element={<Research />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/products" element={<Products />} />
              <Route path="/game" element={<Game />} />
              <Route path="/chat" element={<ChatPanel scope="prevention" />} />
              <Route path="/admin" element={<section lang="zh-Hant">{lang !== 'zh-Hant' && <p className="text-sm" lang={lang}>{t('管理後台使用繁體中文。', 'The administration area is in Traditional Chinese.', '管理画面は繁体字中国語です。', '관리 화면은 중국어 번체로 제공됩니다.')}</p>}<Admin /></section>} />
              <Route path="*" element={<div className="card">{t('找不到頁面。', 'Page not found. ', 'ページが見つかりません。', '페이지를 찾을 수 없습니다. ')}<Link to="/">{t('回首頁', 'Home', 'ホームへ', '홈으로')}</Link></div>} />
            </Routes>
          </main>
          <footer className="site-footer text-xs">
            <p>{t('識詐數據庫 v0.2（三重商工資料處理科專題研究原型）。分析結果僅供參考，不是司法認定或正式詐騙判決。', 'ScamCheck v0.2 · A student research project at Sanchong Commercial and Industrial Vocational High School. Results are for reference only and carry no legal authority.', '詐欺チェック v0.2（三重商工・資料処理科の研究プロジェクト）。結果は参考情報であり、司法上の認定ではありません。', '사기 확인 v0.2 · 싼충상공 자료처리과 학생 연구 프로젝트입니다. 결과는 참고 자료이며 법적 판단이 아닙니다.')}</p>
            <p className="mt-1">
              {t('遇到可疑狀況請撥打 165 反詐騙諮詢專線。', 'Taiwan anti-fraud hotline: 165.', '台湾の詐欺相談窓口：165。', '대만 사기 상담 전화 165.')} · <Link to="/privacy">{t('隱私政策', 'Privacy', 'プライバシー', '개인정보 처리방침')}</Link> ·{' '}
              <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">{t('原始碼（AGPL-3.0）','Source code (AGPL-3.0)','ソースコード（AGPL-3.0）','소스 코드 (AGPL-3.0)')}</a>
            </p>
          </footer>
        </div>
      </div>
      <FloatingTools pathname={loc.pathname} />
      <LanguageMenu desktop />
      <SupportBall key={loc.pathname} mobileEnabled={ballEnabled} />
    </div>
  )
}
