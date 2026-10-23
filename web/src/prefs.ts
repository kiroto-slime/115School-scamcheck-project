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

export function applyLargeText(on: boolean) {
  // Tailwind 的大小都用 rem，放大根字級就能整頁一起放大
  document.documentElement.style.fontSize = on ? '118.75%' : ''
}

/** 在畫面出現前先套用，避免閃一下 */
export function initPrefs() {
  applyTheme((read('theme') as Theme | null) ?? systemTheme())
  applyLargeText(read('largeText') === '1')
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

export function useLargeText() {
  const [large, setLarge] = useState(() => read('largeText') === '1')
  useEffect(() => applyLargeText(large), [large])
  const toggle = () => setLarge((v) => {
    write('largeText', v ? '0' : '1')
    return !v
  })
  return { large, toggle }
}
