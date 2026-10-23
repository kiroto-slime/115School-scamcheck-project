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

const NAV = [
  ['/check', '防詐查核'],
  ['/research', '研究測驗'],
  ['/products', '產品構想'],
  ['/privacy', '隱私與研究說明'],
  ['/admin', '管理'],
] as const

export default function App() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [loc.pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2">
          <Link to="/" className="flex min-h-11 items-center gap-2 font-bold text-slate-900 no-underline">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            識詐數據庫
          </Link>
          <button
            className="btn-secondary md:hidden"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '關閉選單' : '選單'}
          </button>
          <nav id="main-nav" className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-full flex-col border-b border-slate-200 bg-white p-2 md:static md:flex md:flex-row md:border-0 md:p-0`}>
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex min-h-11 items-center rounded-lg px-3 text-slate-700 no-underline hover:bg-slate-100 ${isActive ? 'bg-teal-50 font-semibold text-teal-800' : ''}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-5">
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
      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
        <p>識詐數據庫 v0.1（高中專題研究原型）。分析結果僅供參考，不是司法認定或正式詐騙判決。</p>
        <p className="mt-1">遇到可疑狀況請撥打 165 反詐騙諮詢專線。 · <Link to="/privacy">隱私政策</Link></p>
      </footer>
    </div>
  )
}
