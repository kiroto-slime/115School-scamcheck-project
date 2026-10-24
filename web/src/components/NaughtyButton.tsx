import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'

/**
 * 調皮的送出按鈕：還沒填內容時會躲開（點子來自 Codfish 的 ChillComponent，這裡是自行以 React 重寫）。
 * - 電腦：滑鼠靠近就跳開；手機：點了會跑走。只在按鈕所在的區域內移動，不會跑出畫面。
 * - 鍵盤（Tab＋Enter）不跑，照常送出並顯示提示；系統開「減少動態效果」時不移動。
 * - 填了內容就回到原位、恢復正常。
 */
export function NaughtyButton({ empty, hint, children }: { empty: boolean; hint: string; children: ReactNode }) {
  const area = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [showHint, setShowHint] = useState(false)
  const lastPointer = useRef<string>('')

  // 有內容了：回到原位、收起提示
  useEffect(() => {
    if (!empty) {
      setOffset({ x: 0, y: 0 })
      setShowHint(false)
    }
  }, [empty])

  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  /** 在區域內挑一個離目前位置夠遠的新位置 */
  const run = () => {
    setShowHint(true)
    if (reduced() || !area.current || !btn.current) return
    // 用版面位置（不受移動動畫影響）計算，連續觸發時才不會算錯而跑出區域
    const areaWidth = area.current.clientWidth
    const btnWidth = btn.current.offsetWidth
    const baseLeft = btn.current.offsetLeft
    const room = Math.max(0, areaWidth - btnWidth) // 可以左右移動的空間
    let x = 0
    if (room > 0) {
      for (let i = 0; i < 6; i++) {
        x = Math.round(Math.random() * room - baseLeft)
        if (Math.abs(x - offset.x) > Math.min(room / 2, btnWidth * 0.8)) break
      }
      x = Math.min(Math.max(x, -baseLeft), room - baseLeft) // 保證留在區域內
    }
    // 上下只小幅移動，避免蓋到上面的內容
    const y = offset.y >= 0 ? -Math.round(12 + Math.random() * 16) : Math.round(12 + Math.random() * 16)
    setOffset({ x, y })
  }

  const onPointerEnter = (e: PointerEvent) => {
    if (empty && e.pointerType === 'mouse') run()
  }
  const onPointerDown = (e: PointerEvent) => { lastPointer.current = e.pointerType }
  const onClick = (e: MouseEvent) => {
    if (!empty) return
    // 鍵盤送出（沒有指標座標）：不跑，照常送出讓頁面顯示錯誤提示
    if (e.detail === 0) { setShowHint(true); return }
    if (reduced()) { setShowHint(true); return }
    e.preventDefault()
    run()
  }

  return (
    <div ref={area} className="naughty-area">
      <button ref={btn} type="submit" className={`btn-primary ${empty ? 'w-auto' : 'w-full sm:w-auto'}`}
        data-moved={offset.x !== 0 || offset.y !== 0 ? 'true' : undefined}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, transition: 'transform .28s cubic-bezier(.34,1.56,.64,1)' }}
        onPointerEnter={onPointerEnter} onPointerDown={onPointerDown} onClick={onClick}>
        {children}
      </button>
      {empty && showHint && <p className="mt-2 text-sm text-slate-600" role="status">{hint}</p>}
    </div>
  )
}
