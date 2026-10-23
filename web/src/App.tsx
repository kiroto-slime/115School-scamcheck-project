import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ModeBanner } from './components/ui'
import Home from './pages/Home'
import Check from './pages/Check'
import Result from './pages/Result'
import Research from './pages/Research'
import Privacy from './pages/Privacy'
import Products from './pages/Products'
import Admin from './pages/Admin'
import { useLargeText, useTheme } from './prefs'

const NAV = [
  ['/check', '防詐查核'],
  ['/research', '研究測驗'],
  ['/products', '產品構想'],
  ['/privacy', '隱私與研究說明'],
  ['/admin', '管理'],
] as const

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
    <button className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100" onClick={toggle}
      aria-label={dark ? '切換成淺色模式' : '切換成深色模式'} title={dark ? '淺色模式' : '深色模式'}>
      <Icon d={dark ? SUN : MOON} />
    </button>
  )
}

/** 平滑捲到最上面；如果捲動被打斷（例如頁面內容變動），最後直接跳到頂端 */
function scrollToTop() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  setTimeout(() => { if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'auto' }) }, 800)
}

/** 右下角：大字模式（＋／－）與回到頂端 */
function FloatingButtons() {
  const { large, toggle } = useLargeText()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 300)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const round = 'flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition'
  return (
    <div className="fixed right-4 z-30 flex flex-col items-center gap-3" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
      <button className={`${round} bg-teal-700 text-white hover:bg-teal-800`} onClick={toggle} aria-pressed={large}
        aria-label={large ? '恢復一般文字大小' : '放大文字（大字模式）'} title={large ? '縮小文字' : '放大文字'}>
        <Icon d={large ? 'M5 12h14' : 'M12 5v14M5 12h14'} className="h-7 w-7" />
      </button>
      {/* 回到頂端：只在往下捲時出現；沒出現時保留位置，上面的按鈕才不會跳動 */}
      <button className={`${round} border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 ${scrolled ? '' : 'invisible'}`}
        onClick={scrollToTop} aria-label="回到頁面頂端" title="回到頂端" tabIndex={scrolled ? 0 : -1}>
        <Icon d="M12 19V5M5 12l7-7 7 7" />
      </button>
    </div>
  )
}

const linkClass = (isActive: boolean) =>
  `flex min-h-11 items-center rounded-md border px-3 no-underline transition ${
    isActive ? 'border-teal-600 bg-teal-50 text-[1.0625rem] font-semibold text-teal-800' : 'border-transparent text-slate-700 hover:bg-slate-100'
  }`

export default function App() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [loc.pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-2 md:px-6">
          <Link to="/" className="flex min-h-11 items-center gap-2 font-bold text-slate-900 no-underline">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            識詐數據庫
          </Link>
          <div className="flex items-center gap-1">
            <ThemeButton />
            <button
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 md:hidden"
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
        <nav id="main-nav" aria-label="主選單" className={`${open ? 'flex' : 'hidden'} flex-col gap-1 border-t border-slate-200 p-2 md:hidden`}>
          {NAV.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => linkClass(isActive)}>{label}</NavLink>)}
        </nav>
      </header>

      <div className="flex flex-1">
        {/* 電腦：左側導覽列 */}
        <aside className="hidden w-52 shrink-0 border-r border-slate-200 bg-white md:block">
          <nav aria-label="主選單" className="sticky top-[61px] flex flex-col gap-1 p-3">
            {NAV.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => linkClass(isActive)}>{label}</NavLink>)}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-5 md:px-6">
            <ModeBanner />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/check" element={<Check />} />
              <Route path="/result/:id" element={<Result />} />
              <Route path="/research" element={<Research />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/products" element={<Products />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<div className="card">找不到頁面。<Link to="/">回首頁</Link></div>} />
            </Routes>
          </main>
          <footer className="border-t border-slate-200 bg-white px-4 pb-20 pt-4 text-center text-xs text-slate-500 md:pb-4">
            <p>識詐數據庫 v0.2（三重商工資料處理科專題研究原型）。分析結果僅供參考，不是司法認定或正式詐騙判決。</p>
            <p className="mt-1">
              遇到可疑狀況請撥打 165 反詐騙諮詢專線。 · <Link to="/privacy">隱私政策</Link> ·{' '}
              <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">原始碼（AGPL-3.0）</a>
            </p>
          </footer>
        </div>
      </div>
      <FloatingButtons />
    </div>
  )
}
