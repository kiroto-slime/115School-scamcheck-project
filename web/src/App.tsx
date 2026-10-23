import { useEffect, useRef, useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { ModeBanner } from './components/ui'
import { FloatingTools } from './components/FloatingTools'
import { Navigation } from './components/Navigation'
import Home from './pages/Home'
import Check from './pages/Check'
import Result from './pages/Result'
import Research from './pages/Research'
import Privacy from './pages/Privacy'
import Products from './pages/Products'
import Admin from './pages/Admin'
import History from './pages/History'
import Game from './pages/Game'
import { useTheme } from './prefs'

const SOURCE_URL = 'https://github.com/kiroto-slime/115School-scamcheck-project'

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
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button className="header-button" onClick={toggle}
      aria-label={dark ? '切換成淺色模式' : '切換成深色模式'} title={dark ? '淺色模式' : '深色模式'}>
      <Icon d={dark ? SUN : MOON} />
    </button>
  )
}

export default function App() {
  const [open, setOpen] = useState(false)
  const [pinnedChoice, setPinnedChoice] = useState<boolean | null>(null)
  const [landscape, setLandscape] = useState(() => window.matchMedia('(orientation: landscape) and (max-width: 1180px) and (max-height: 600px)').matches)
  const [peek, setPeek] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const edgeHandle = useRef<HTMLButtonElement>(null)
  const sidebar = useRef<HTMLElement>(null)
  const returnFocus = useRef(false)
  const keyboardOpen = useRef(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const header = useRef<HTMLElement>(null)
  const loc = useLocation()
  const pinned = pinnedChoice ?? !(landscape && loc.pathname === '/game')
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
    const query = window.matchMedia('(orientation: landscape) and (max-width: 1180px) and (max-height: 600px)')
    const update = () => { setLandscape(query.matches); setPeek(false) }
    query.addEventListener('change', update)
    return () => { query.removeEventListener('change', update); cancelClose() }
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
            識詐數據庫
            </Link>
            <button className="header-button sidebar-toggle" aria-controls="sidebar-panel" aria-pressed={!pinned}
            aria-label={pinned ? '將導覽列設為自動隱藏' : '將導覽列設為常駐'}
            title={pinned ? '自動隱藏導覽列' : '常駐導覽列'}
            onClick={() => { setPinnedChoice(!pinned); setOpen(false); closePeek() }}>
            <Icon d={pinned ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <ThemeButton />
            <button
              className="header-button mobile-menu-toggle"
              aria-expanded={open}
              aria-controls="main-nav"
              aria-label={open ? '關閉選單' : '開啟選單'}
              onClick={() => setOpen((v) => !v)}
            >
              <Icon d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
            </button>
          </div>
        </div>
        {/* 手機：漢堡選單展開 */}
        <Navigation mobile open={pinned && open} />
      </header>

      <div className="flex flex-1">
        {/* 電腦：左側導覽列 */}
        {!pinned && <>
          {peek && <button className="sidebar-backdrop" aria-label="關閉左側導覽列" tabIndex={-1}
            onClick={() => closePeek(true)} />}
          <div className="sidebar-edge" aria-hidden="true"
            onPointerEnter={(event) => { if (event.pointerType === 'mouse') reveal() }}
            onPointerLeave={(event) => { if (event.pointerType === 'mouse') scheduleClose() }} />
          <button ref={edgeHandle} className="sidebar-handle" aria-controls="sidebar-panel" aria-expanded={peek}
            aria-label="展開左側導覽列" onClick={(event) => {
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
          <Navigation />
        </aside>

        <div className="content-column flex min-w-0 flex-1 flex-col">
          <main className="main-content space-y-5">
            <ModeBanner />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/check" element={<Check />} />
              <Route path="/result/:id" element={<Result />} />
              <Route path="/history" element={<History />} />
              <Route path="/research" element={<Research />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/products" element={<Products />} />
              <Route path="/game" element={<Game />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<div className="card">找不到頁面。<Link to="/">回首頁</Link></div>} />
            </Routes>
          </main>
          <footer className="site-footer text-xs">
            <p>識詐數據庫 v0.2（三重商工資料處理科專題研究原型）。分析結果僅供參考，不是司法認定或正式詐騙判決。</p>
            <p className="mt-1">
              遇到可疑狀況請撥打 165 反詐騙諮詢專線。 · <Link to="/privacy">隱私政策</Link> ·{' '}
              <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">原始碼（AGPL-3.0）</a>
            </p>
          </footer>
        </div>
      </div>
      <FloatingTools pathname={loc.pathname} />
    </div>
  )
}
