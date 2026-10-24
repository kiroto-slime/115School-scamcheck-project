import { useEffect, useRef, useState } from 'react'
import { TEXT_SIZE_LABEL, TEXT_SIZES, useTextSize } from '../prefs'

/** 工具共用定位基準，回頂途中保留兩顆按鈕的位置。 */
export function FloatingTools({ pathname }: { pathname: string }) {
  const { size, next } = useTextSize()
  const nextLabel = TEXT_SIZE_LABEL[TEXT_SIZES[(TEXT_SIZES.indexOf(size) + 1) % TEXT_SIZES.length]]
  const [showTop, setShowTop] = useState(false)
  const returning = useRef(false)

  useEffect(() => {
    returning.current = false
    setShowTop(false)
    const onScroll = () => {
      if (window.scrollY <= 1) returning.current = false
      setShowTop(returning.current || window.scrollY > 300)
    }
    const interrupt = () => {
      if (!returning.current) return
      returning.current = false
      window.scrollTo({ top: window.scrollY, behavior: 'instant' })
      onScroll()
    }
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) interrupt()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', interrupt, { passive: true })
    window.addEventListener('touchstart', interrupt, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('wheel', interrupt)
      window.removeEventListener('touchstart', interrupt)
      window.removeEventListener('keydown', onKey)
      returning.current = false
    }
  }, [pathname])

  const toTop = () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    returning.current = !reduced && window.scrollY > 1
    window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' })
  }

  return (
    <div className={`floating-tools ${showTop ? 'has-top' : ''}`} role="group" aria-label="閱讀工具">
      {/* 按鈕直接顯示目前的文字大小；按一下依序切換 小 → 中 → 大 → 小 */}
      <button className="reading-toggle" onClick={next}
        aria-label={`文字大小：${TEXT_SIZE_LABEL[size]}，按一下改成${nextLabel}`} title={`文字大小：${TEXT_SIZE_LABEL[size]}（按一下改成${nextLabel}）`}>
        <span className="text-size-label" aria-hidden="true">{TEXT_SIZE_LABEL[size]}</span>
      </button>
      <button className="top-toggle" hidden={!showTop} onClick={toTop} aria-label="回到頁面頂端" title="回到頂端">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  )
}
