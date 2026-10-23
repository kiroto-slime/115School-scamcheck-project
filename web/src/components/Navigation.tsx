import { useRef, type PointerEvent } from 'react'
import { NavLink } from 'react-router-dom'

const GROUPS = [
  { title: '日常查核', links: [
    ['/check', '防詐查核', 'M21 21l-5-5M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15'],
    ['/history', '查核紀錄', 'M3 5v5h5M3 10a9 9 0 1 1 2 8M12 7v5l3 2'],
  ] },
  { title: '參與研究', links: [
    ['/research', '研究測驗', 'M12 5v15M12 5C8 2 4 3 2 4v15c3-2 7-2 10 1 3-3 7-3 10-1V4c-3-1-7-2-10 1'],
    ['/products', '產品與需求', 'M21 11a8 8 0 0 1-8 8H4l-3 3 2-7a8 8 0 1 1 18-4M7 9h10M7 13h6'],
  ] },
  { title: '關於網站', links: [
    ['/privacy', '隱私與說明', 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3'],
    ['/game', '小遊戲', 'M7 7h10a5 5 0 0 1 5 5v5a3 3 0 0 1-5 2l-2-2H9l-2 2a3 3 0 0 1-5-2v-5a5 5 0 0 1 5-5zM7 10v6M4 13h6M16 11h.01M19 14h.01'],
  ] },
] as const

export function Navigation({ mobile = false, open = false }: { mobile?: boolean; open?: boolean }) {
  const nav = useRef<HTMLElement>(null)
  const reset = () => nav.current?.querySelectorAll<HTMLElement>('.nav-item').forEach((item) => item.style.removeProperty('--nav-shift'))
  const followPointer = (event: PointerEvent<HTMLElement>) => {
    if (mobile || !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return
    nav.current?.querySelectorAll<HTMLElement>('.nav-item').forEach((item) => {
      const rect = item.getBoundingClientRect()
      const influence = Math.max(0, 1 - Math.abs(event.clientY - rect.top - rect.height / 2) / 180)
      item.style.setProperty('--nav-shift', `${36 * influence * influence}px`)
    })
  }
  return (
    <nav ref={nav} id={mobile ? 'main-nav' : undefined} aria-label="主選單"
      className={mobile ? `mobile-nav ${open ? 'is-open' : ''}` : 'desktop-nav'}
      onPointerMove={followPointer} onPointerLeave={reset}>
      {GROUPS.map((group) => (
        <div className="nav-group" key={group.title}>
          <p className="nav-heading">{group.title}</p>
          {group.links.map(([to, label, path]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
