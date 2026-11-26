import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { ChatPanel } from './ChatPanel'

type Point = { x: number; y: number }
const size = 48
const gap = 10
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/** 小球和對話框使用目前可見範圍，輸入法鍵盤出現或側欄收合時重新定位。 */
export function SupportBall({ mobileEnabled }: { mobileEnabled: boolean }) {
  const ball = useRef<HTMLButtonElement>(null)
  const [bounds, setBounds] = useState<{ left: number; top: number; right: number; bottom: number; dock: Point }>()
  const [point, setPoint] = useState<Point | null>(null)
  const [open, setOpen] = useState(false)
  const drag = useRef<{ id: number; start: Point; origin: Point; moved: boolean } | null>(null)
  const skipClick = useRef(false)

  useLayoutEffect(() => {
    const column = document.querySelector<HTMLElement>('.content-column')!
    const header = document.querySelector<HTMLElement>('.topbar')!
    const tools = document.querySelector<HTMLElement>('.floating-tools')!
    const viewport = window.visualViewport
    const measure = () => {
      const left = viewport?.offsetLeft ?? 0
      const top = viewport?.offsetTop ?? 0
      const right = left + (viewport?.width ?? document.documentElement.clientWidth)
      const bottom = top + (viewport?.height ?? window.innerHeight)
      const dock = tools.getBoundingClientRect()
      setBounds({
        left: Math.max(left, column.getBoundingClientRect().left) + gap,
        top: Math.max(top, header.getBoundingClientRect().bottom) + gap,
        right: right - gap, bottom: bottom - gap,
        dock: { x: Math.min(right, dock.left) - gap - size, y: Math.min(bottom - gap, dock.bottom) - size },
      })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    for (const element of [column, header, tools]) observer?.observe(element)
    window.addEventListener('resize', measure)
    viewport?.addEventListener('resize', measure)
    viewport?.addEventListener('scroll', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      viewport?.removeEventListener('resize', measure)
      viewport?.removeEventListener('scroll', measure)
    }
  }, [])

  if (!bounds) return null
  const { left, top, right, bottom, dock } = bounds
  const x = clamp(point?.x ?? dock.x, left, dock.x)
  const y = clamp(point?.y ?? dock.y, top, bottom - size)
  const width = Math.min(360, right - left)
  const above = y - gap - top
  const below = bottom - y - size - gap
  const sideRoom = Math.max(x - gap - left, right - x - size - gap)
  const toSide = Math.max(above, below) < 320 && sideRoom >= width
  const panelX = toSide ? (x - gap - left >= width ? x - gap - width : x + size + gap) : clamp(x + size - width, left, right - width)
  // 窄螢幕的對話框較寬，保留字級與回頂兩顆按鈕的高度。
  const panelBottom = panelX + width > dock.x + size ? Math.min(bottom, dock.y - size - 2 * gap) : bottom
  const aboveEnd = Math.min(panelBottom, y - gap)
  const useAbove = aboveEnd - top >= panelBottom - y - size - gap
  const height = Math.max(0, Math.min(388, toSide ? panelBottom - top : useAbove ? aboveEnd - top : panelBottom - y - size - gap))
  const panelY = toSide ? clamp(y - height / 2, top, panelBottom - height) : useAbove ? aboveEnd - height : y + size + gap
  const close = () => { setOpen(false); ball.current?.focus({ preventScroll: true }) }
  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    skipClick.current = false
    if (event.button !== 0 || event.pointerType === 'touch') return
    drag.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x, y }, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    const dx = event.clientX - d.start.x
    const dy = event.clientY - d.start.y
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    d.moved = true
    skipClick.current = true
    setPoint({ x: clamp(d.origin.x + dx, left, dock.x), y: clamp(d.origin.y + dy, top, bottom - size) })
  }
  return <div className={'support-layer' + (mobileEnabled ? ' mobile-enabled' : '')}>
    <button ref={ball} className="support-ball" style={{ left: x, top: y, width: size, height: size }}
      aria-label="客服問答" title="客服問答" aria-haspopup="dialog" aria-expanded={open}
      onPointerDown={startDrag} onPointerMove={move} onLostPointerCapture={() => { drag.current = null }}
      onClick={event => { if (event.detail === 0 || !skipClick.current) setOpen(!open); skipClick.current = false }}
      onKeyDown={event => { if (event.key === 'Escape' && open) close() }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5 10 10 0 0 1-3.4-.6L4 21l1-4a8.5 8.5 0 1 1 15.5-5.5Z M8.5 10h7M8.5 13.5H13" />
      </svg>
    </button>
    {open && <div className="support-window" style={{ left: panelX, top: panelY, width, height }}>
      <ChatPanel scope="support" onClose={close} />
    </div>}
  </div>
}
