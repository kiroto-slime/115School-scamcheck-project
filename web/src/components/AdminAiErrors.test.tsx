import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AdminAiErrors } from './AdminAiErrors'

afterEach(cleanup)

it('依日期列出各模型的錯誤類型（中文）、狀態碼與次數；沒有錯誤的日子顯示沒有錯誤', async () => {
  const data = { days: [
    { day: '2026-11-27', rows: [
      { model: 'gemini-3.6-flash', category: 'model_unavailable', status: 404, count: 3 },
      { model: 'gemini-2.5-flash', category: 'busy', status: 503, count: 1 },
    ] },
    { day: '2026-11-26', rows: [] },
  ] }
  render(<AdminAiErrors call={async <T,>() => data as T} />)
  expect(await screen.findByText('2026-11-27')).toBeVisible()
  expect(screen.getByText('gemini-3.6-flash')).toBeVisible()
  expect(screen.getByText(/模型不存在或不支援此 API/)).toBeVisible()
  expect(screen.getByText(/HTTP 404・3 次/)).toBeVisible()
  expect(screen.getByText(/Google 暫時忙碌/)).toBeVisible()
  expect(screen.getByText('這天沒有 AI 錯誤。')).toBeVisible()
})

it('回應格式不對時顯示載入失敗，不讓設定頁當掉', async () => {
  render(<AdminAiErrors call={async <T,>() => ({ updated: true }) as T} />)
  expect(await screen.findByText('無法載入 AI 錯誤紀錄，請重新整理頁面。')).toBeVisible()
})
