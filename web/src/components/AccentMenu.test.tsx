import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { AccentMenu } from './AccentMenu'

afterEach(() => { cleanup(); localStorage.clear(); delete document.documentElement.dataset.accent })

describe('配色主題選單', () => {
  it('預設青綠；選其他配色會套用並記住，選回青綠恢復原樣', async () => {
    render(<AccentMenu />)
    const btn = screen.getByRole('button', { name: /配色主題：青綠（預設）/ })
    expect(document.documentElement.dataset.accent).toBeUndefined()
    await userEvent.click(btn)
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(5)
    await userEvent.click(screen.getByRole('menuitemradio', { name: /海洋藍/ }))
    expect(document.documentElement.dataset.accent).toBe('blue')
    expect(localStorage.getItem('accent')).toBe('blue')
    expect(screen.queryByRole('menu')).toBeNull() // 選完自動關閉
    await userEvent.click(screen.getByRole('button', { name: /配色主題：海洋藍/ }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: /青綠/ }))
    expect(document.documentElement.dataset.accent).toBeUndefined()
  })

  it('按 Esc 關閉選單', async () => {
    render(<AccentMenu />)
    await userEvent.click(screen.getByRole('button', { name: /配色主題/ }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
