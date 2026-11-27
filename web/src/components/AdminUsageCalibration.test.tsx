import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminUsageCalibration } from './AdminUsageCalibration'

afterEach(cleanup)

it('列出網站今天記的次數；填入 Google 看到的數字後送出校準並更新畫面', async () => {
  let used = 4
  const requests = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') used = JSON.parse(init.body as string).used
    return { day: '2026-11-26', models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', daily: 20, used }] }
  })
  render(<AdminUsageCalibration call={async <T,>(url: string, init?: RequestInit) => await requests(url, init) as T} />)
  expect(await screen.findByText(/網站今天記了 4 次／上限 20 次/)).toBeVisible()
  expect(screen.getByText(/2026-11-26/)).toBeVisible()
  const input = screen.getByLabelText('Gemini 2.5 Flash 今天 Google 已用次數')
  await userEvent.clear(input)
  await userEvent.type(input, '11')
  await userEvent.click(screen.getByRole('button', { name: '校準 Gemini 2.5 Flash' }))
  expect(requests).toHaveBeenLastCalledWith('/api/admin/ai/usage', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ model: 'gemini-2.5-flash', used: 11 }),
  }))
  expect(await screen.findByText(/網站今天記了 11 次／上限 20 次/)).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('已把 Gemini 2.5 Flash 今天的次數校準為 11 次')
})

it('API 回傳格式不對時顯示載入失敗，不讓設定頁當掉', async () => {
  render(<AdminUsageCalibration call={async <T,>() => ({ updated: true }) as T} />)
  expect(await screen.findByText('無法載入今天的次數，請重新整理頁面。')).toBeVisible()
})

it('空白或不是整數時不送出', async () => {
  const requests = vi.fn(async () => ({ day: '2026-11-26', models: [{ id: 'm-1', label: 'M 1', daily: 20, used: 0 }] }))
  render(<AdminUsageCalibration call={async <T,>() => await requests() as T} />)
  const input = await screen.findByLabelText('M 1 今天 Google 已用次數')
  await userEvent.clear(input)
  expect(screen.getByRole('button', { name: '校準 M 1' })).toBeDisabled()
  await userEvent.type(input, '1.5')
  expect(screen.getByRole('button', { name: '校準 M 1' })).toBeDisabled()
  expect(requests).toHaveBeenCalledTimes(1)
})
