import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { ChatPanel } from './ChatPanel'
import { useLanguage } from '../language'

type Point = { x: number; y: number }
const gap = 10
const touchDragThreshold = 8
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/** 小球和對話框使用目前可見範圍，輸入法鍵盤出現或側欄收合時重新定位。 */
export function SupportBall({ mobileEnabled }: { mobileEnabled: boolean }) {
  const { t } = useLanguage()
  const ball = useRef<HTMLButtonElement>(null)
  const [bounds, setBounds] = useState<{ left: number; top: number; right: number; bottom: number; size: number; toolsTop: number; dock: Point }>()
  const [point, setPoint] = useState<Point | null>(null)
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed')
  const panel = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState(0)
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
      const size = Math.ceil(dock.width * 1.5)
      setBounds({
        left: Math.max(left, column.getBoundingClientRect().left) + gap,
        top: Math.max(top, header.getBoundingClientRect().bottom) + gap,
        right: right - gap, bottom: bottom - gap, size,
        toolsTop: dock.top - dock.height - 2 * gap,
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

  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    element.inert = phase === 'closing'
    if (phase !== 'closing') return
    let current = true
    const transitions = element.getAnimations?.() ?? []
    Promise.allSettled(transitions.map(animation => animation.finished)).then(() => {
      if (current) setPhase('closed')
    })
    return () => { current = false }
  }, [phase])

  if (!bounds) return null
  const { left, top, right, bottom, size, toolsTop, dock } = bounds
  const x = clamp(point?.x ?? dock.x, left, dock.x)
  const y = clamp(point?.y ?? dock.y, top, bottom - size)
  const width = Math.min(360, right - left)
  const above = y - gap - top
  const below = bottom - y - size - gap
  const sideRoom = Math.max(x - gap - left, right - x - size - gap)
  const toSide = Math.max(above, below) < 320 && sideRoom >= width
  const panelX = toSide ? (x - gap - left >= width ? x - gap - width : x + size + gap) : clamp(x + size - width, left, right - width)
  // 窄螢幕的對話框較寬，保留字級與回頂兩顆按鈕的高度。
  const panelBottom = panelX + width > dock.x + size ? Math.min(bottom, toolsTop) : bottom
  const aboveEnd = Math.min(panelBottom, y - gap)
  const useAbove = aboveEnd - top >= panelBottom - y - size - gap
  const height = Math.max(0, Math.min(388, toSide ? panelBottom - top : useAbove ? aboveEnd - top : panelBottom - y - size - gap))
  const panelY = toSide ? clamp(y - height / 2, top, panelBottom - height) : useAbove ? aboveEnd - height : y + size + gap
  const close = () => { ball.current?.focus({ preventScroll: true }); setPhase('closing') }
  const toggle = () => {
    if (phase === 'open') { close(); return }
    setSession(previous => previous + 1)
    setPhase('open')
  }
  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return
    skipClick.current = false
    drag.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x, y }, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    const dx = event.clientX - d.start.x
    const dy = event.clientY - d.start.y
    const threshold = event.pointerType === 'touch' ? touchDragThreshold : 5
    if (!d.moved && Math.hypot(dx, dy) < threshold) return
    d.moved = true
    skipClick.current = true
    setPoint({ x: clamp(d.origin.x + dx, left, dock.x), y: clamp(d.origin.y + dy, top, bottom - size) })
  }
  const finishTouch = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (event.pointerType !== 'touch' || d?.id !== event.pointerId) return
    // 有些手機在拖動後的下一次輕點只送出指標事件；若另有 click，也只開合一次。
    skipClick.current = true
    if (!d.moved && Math.hypot(event.clientX - d.start.x, event.clientY - d.start.y) < touchDragThreshold) toggle()
  }
  return <div className={'support-layer' + (mobileEnabled ? ' mobile-enabled' : '')}>
    <button ref={ball} className="support-ball" style={{ left: x, top: y, width: size, height: size }}
      aria-label={t('客服問答')} title={t('客服問答')} aria-haspopup="dialog" aria-expanded={phase === 'open'}
      onPointerDown={startDrag} onPointerMove={move} onPointerUp={finishTouch} onLostPointerCapture={event => {
        if (drag.current?.id === event.pointerId) drag.current = null
      }}
      onClick={event => { if (event.detail === 0 || !skipClick.current) toggle(); skipClick.current = false }}
      onKeyDown={event => { if (event.key === 'Escape' && phase === 'open') close() }}>
      <span className="support-glass" aria-hidden="true">
        <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5 10 10 0 0 1-3.4-.6L4 21l1-4a8.5 8.5 0 1 1 15.5-5.5Z M8.5 10h7M8.5 13.5H13" />
        </svg>
      </span>
    </button>
    {phase !== 'closed' && <div ref={panel} className="support-window" data-phase={phase}
      style={{ left: panelX, top: panelY, width, height,
        transformOrigin: `${x + size / 2 - panelX}px ${y + size / 2 - panelY}px` }}>
      <ChatPanel key={session} scope="support" onClose={close} />
    </div>}
  </div>
}
