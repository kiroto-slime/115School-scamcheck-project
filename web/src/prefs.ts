/** 使用者偏好：深淺色、大字模式。存在瀏覽器（無法存取時就用預設，不影響使用） */
import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 無痕模式等情況存不了，沒關係 */
  }
}

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#020617' : '#0f766e')
}

/** 文字大小三段：小（預設）→ 中 → 大。Tailwind 的大小都用 rem，改根字級就能整頁一起縮放 */
export type TextSize = 'small' | 'medium' | 'large'
export const TEXT_SIZES: TextSize[] = ['small', 'medium', 'large']
export const TEXT_SIZE_LABEL: Record<TextSize, string> = { small: '小', medium: '中', large: '大' }
const ROOT_SIZE: Record<TextSize, string> = { small: '', medium: '118.75%', large: '137.5%' }

export function applyTextSize(size: TextSize) {
  document.documentElement.style.fontSize = ROOT_SIZE[size]
}

/** 讀取設定；舊版只有「大字模式」開或關，開著的對應到「中」 */
function readTextSize(): TextSize {
  const v = read('textSize')
  if (v === 'small' || v === 'medium' || v === 'large') return v
  return read('largeText') === '1' ? 'medium' : 'small'
}

/** 在畫面出現前先套用，避免閃一下 */
export function initPrefs() {
  applyTheme((read('theme') as Theme | null) ?? systemTheme())
  applyTextSize(readTextSize())
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => ((read('theme') as Theme | null) ?? systemTheme()))
  useEffect(() => applyTheme(theme), [theme])
  const toggle = () => setTheme((t) => {
    const next = t === 'dark' ? 'light' : 'dark'
    write('theme', next)
    return next
  })
  return { theme, toggle }
}

export function useTextSize() {
  const [size, setSize] = useState<TextSize>(readTextSize)
  useEffect(() => applyTextSize(size), [size])
  /** 小 → 中 → 大 → 小 */
  const next = () => setSize((cur) => {
    const n = TEXT_SIZES[(TEXT_SIZES.indexOf(cur) + 1) % TEXT_SIZES.length]
    write('textSize', n)
    return n
  })
  return { size, next }
}
