import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminAiQuota } from './AdminAiQuota'

const base = {
  configured: true, interval_minutes: 30, auto_enabled: false, status: 'pending',
  checked_at: null, attempted_at: null, models: [], can_enable: false,
}
afterEach(cleanup)

it('本機管理頁預設提供個人唯讀更新，尚未授權時不觸發伺服器校準', async () => {
  window.history.replaceState(null, '', '/admin')
  const requests = vi.fn(async () => ({ ...base, configured: false }))
  try {
    render(<AdminAiQuota call={async <T,>() => await requests() as T} />)
    expect(await screen.findByLabelText('網頁用戶端 ID')).toBeVisible()
    expect(screen.getByRole('button', { name: '立即更新' })).toBeDisabled()
    expect(requests).toHaveBeenCalledTimes(1)
    await userEvent.selectOptions(screen.getByLabelText('查詢方式'), 'server')
    expect(screen.getByRole('combobox', { name: '自動校準' })).toBeVisible()
  } finally {
    window.history.replaceState(null, '', '/')
  }
})

it('停用排程時可單獨更新，核對後可直接選 45 分鐘或切回停用', async () => {
  let schedule = { auto_enabled: false, interval_minutes: 30 }
  let verified = false
  const requests = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/refresh')) verified = true
    if (url.endsWith('/settings')) schedule = JSON.parse(init!.body as string)
    const asOf = '2026-11-27T02:00:00Z'
    return { ...base, ...schedule, can_enable: verified, checked_at: verified ? asOf : null,
      status: verified ? 'partial' : 'pending',
      models: verified ? [{ id: 'gemini-test', limit: 20, used: 11, as_of: asOf }] : [] }
  })
  render(<AdminAiQuota call={async <T,>(url: string, init?: RequestInit) => await requests(url, init) as T} />)
  const select = await screen.findByRole('combobox', { name: '自動校準' })
  expect(select).toHaveDisplayValue('停用')
  expect(screen.getByRole('option', { name: '每 45 分鐘' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '立即更新' }))
  await screen.findByText('gemini-test')
  expect(requests).toHaveBeenCalledWith('/api/admin/ai/quota/refresh', { method: 'POST' })
  expect(select).toHaveDisplayValue('停用')
  await userEvent.selectOptions(select, '45')
  expect(schedule).toEqual({ interval_minutes: 45, auto_enabled: true })
  await userEvent.selectOptions(select, 'off')
  expect(schedule).toEqual({ interval_minutes: 45, auto_enabled: false })
  expect(screen.getByRole('button', { name: '立即更新' })).toBeEnabled()
})

it('未設定監控憑證時仍提供官方額度頁，不送出更新請求', async () => {
  const requests = vi.fn(async () => ({ ...base, configured: false }))
  render(<AdminAiQuota call={async <T,>() => await requests() as T} />)
  expect(await screen.findByRole('button', { name: '立即更新' })).toBeDisabled()
  expect(screen.getByRole('link', { name: /Google AI Studio/ })).toHaveAttribute('href', 'https://aistudio.google.com/rate-limit')
  expect(requests).toHaveBeenCalledTimes(1)
})

it('更新失敗時仍可查看上次的讀值和資料時間', async () => {
  const asOf = '2026-11-27T02:00:00Z'
  const previous = { ...base, can_enable: true, checked_at: asOf, status: 'ok',
    models: [{ id: 'gemini-test', limit: 20, used: 11, as_of: asOf }] }
  render(<AdminAiQuota call={async <T,>(url: string) => url.endsWith('/refresh') ? null : previous as T} />)
  await userEvent.click(await screen.findByRole('button', { name: '立即更新' }))
  await screen.findByText(/這次查詢未完成/)
  expect(screen.getByText('gemini-test')).toBeVisible()
  expect(screen.getByText('資料時間').querySelector('time')).toHaveAttribute('datetime', asOf)
})
