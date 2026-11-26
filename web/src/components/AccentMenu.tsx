import { useEffect, useRef, useState } from 'react'
import { ACCENTS, useAccent } from '../prefs'
import { useLanguage } from '../language'

/** 右上角配色選單：每個主題用一個左上淺、右下深的斜切小方塊表示；深淺色仍由旁邊的深淺按鈕切換 */
export function AccentMenu() {
  const { accent, choose } = useAccent()
  const { t } = useLanguage()
  const labels = {
    teal: t('青綠（預設）','Teal (default)','青緑（標準）','청록 (기본)'),
    blue: t('海洋藍','Ocean blue','オーシャンブルー','오션 블루'),
    violet: t('紫羅蘭','Violet','バイオレット','바이올렛'),
    orange: t('暖陽橘','Orange','オレンジ','오렌지'),
    pink: t('櫻花粉','Cherry blossom','桜色','벚꽃색'),
    mono: t('黑白','Black & white','モノクロ','흑백'),
  }
  const caption = t('配色主題','Color palette','配色テーマ','색상 테마')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // 點選單外面或按 Esc 就關閉
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="accent-menu" ref={box}>
      <button className="header-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        aria-label={t(`配色主題：${labels[accent]}`,`Color palette: ${labels[accent]}`,`配色テーマ：${labels[accent]}`,`색상 테마: ${labels[accent]}`)} title={caption}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3z" />
          <circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="8" r="1" />
        </svg>
      </button>
      {open && (
        <div className="accent-popover" role="menu" aria-label={caption}>
          {ACCENTS.map((a) => (
            <button key={a.id} role="menuitemradio" aria-checked={a.id === accent} className="accent-option"
              onClick={() => { choose(a.id); setOpen(false) }}>
              <span className="accent-swatch" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${a.swatch[0]} 50%, ${a.swatch[1]} 50%)` }} />
              <span>{labels[a.id]}</span>
              {a.id === accent && <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-slate-500">{t('使用中','Selected','選択中','선택됨')}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
