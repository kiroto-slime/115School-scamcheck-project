import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

let position = 0
let reducedMotion = false
const scroll = vi.fn()

beforeEach(() => {
  position = 0
  reducedMotion = false
  localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion') && reducedMotion,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => position })
  vi.stubGlobal('scrollTo', scroll.mockReset())
  // 系統狀態屬外部 API，本測試只驗證實際殼層與捲動互動。
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.style.fontSize = '' })

function moveTo(y: number) {
  position = y
  fireEvent.scroll(window)
}
function start() {
  render(<MemoryRouter initialEntries={['/privacy']}><App /></MemoryRouter>)
  moveTo(900)
  return screen.getByRole('button', { name: '回到頁面頂端' })
}

describe('浮動工具', () => {
  it('平順回頂途中仍保留回頂按鈕，真正到頂才收回', async () => {
    const top = start()
    await userEvent.click(top)
    expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' })
    act(() => moveTo(180))
    expect(top).toBeVisible()
    act(() => moveTo(0))
    expect(top).not.toBeVisible()
  })

  it('滾輪中斷動畫時停在使用者所在位置，不再強制回頂', async () => {
    const top = start()
    await userEvent.click(top)
    act(() => moveTo(240))
    fireEvent.wheel(window)
    expect(scroll).toHaveBeenLastCalledWith({ top: 240, behavior: 'instant' })
    expect(top).not.toBeVisible()
  })

  it('減少動態模式直接回頂，不啟用平順動畫', async () => {
    reducedMotion = true
    await userEvent.click(start())
    expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' })
  })

  it('大字按鈕保留原有偏好設定與整頁字級', async () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: '放大文字（大字模式）' }))
    expect(localStorage.getItem('largeText')).toBe('1')
    expect(document.documentElement.style.fontSize).toBe('118.75%')
    await userEvent.click(screen.getByRole('button', { name: '恢復一般文字大小' }))
    expect(localStorage.getItem('largeText')).toBe('0')
    expect(document.documentElement.style.fontSize).toBe('')
  })
})
