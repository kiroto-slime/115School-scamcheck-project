import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addHistory, readHistory } from './history'
import Check from './pages/Check'
import History from './pages/History'

const item = (id: string, daysAgo: number) => ({
  id: id.padEnd(32, '0'), at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), level: '高', score: 90, media: 'text', reason: '網址在警政署 165 涉詐網站名單上',
})

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('查核紀錄（localStorage）', () => {
  it('超過 30 天自動移除、同一筆不重複、最多 50 筆', () => {
    addHistory(item('a', 31))
    addHistory(item('b', 1))
    addHistory(item('b', 0))
    expect(readHistory().map((h) => h.id[0])).toEqual(['b'])
    for (let i = 0; i < 60; i++) addHistory(item(`c${i}`, 0))
    expect(readHistory()).toHaveLength(50)
  })

  it('紀錄頁：列出、移除單筆、確認後清除全部', async () => {
    addHistory(item('a', 2))
    addHistory(item('b', 1))
    render(<MemoryRouter><History /></MemoryRouter>)
    expect(screen.getAllByRole('link', { name: '查看結果' })).toHaveLength(2)
    await userEvent.click(screen.getAllByRole('button', { name: '從紀錄移除' })[0])
    expect(screen.getAllByRole('link', { name: '查看結果' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: '清除全部紀錄' }))
    await userEvent.click(screen.getByRole('button', { name: /確定清除全部/ }))
    expect(screen.getByText('目前沒有查核紀錄。')).toBeInTheDocument()
    expect(localStorage.getItem('checkHistory')).toBeNull()
  })
})

describe('草稿（sessionStorage）', () => {
  it('重新整理後還在；送出成功後清除；紀錄不存原文', async () => {
    const health = { status: 'ok', version: 't', rule_version: 'r', limits: { max_text_chars: 10000, max_image_mb: 10, max_video_mb: 20, max_video_seconds: 30 },
      modes: { cofacts: 'off', google: 'off', virustotal: 'off', ai: 'disabled', ai_model: null, research_mode: 'simulation', research_collection_enabled: true, admin_configured: true } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/health' ? health : { analysis_id: 'f'.repeat(32) }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const first = render(<MemoryRouter><Check /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/貼上可疑訊息/), '我的秘密訊息')
    first.unmount() // 模擬重新整理
    render(<MemoryRouter initialEntries={['/check']}><Routes><Route path="/check" element={<Check />} /><Route path="/result/:id" element={<p>結果頁</p>} /></Routes></MemoryRouter>)
    expect(screen.getByLabelText(/貼上可疑訊息/)).toHaveValue('我的秘密訊息')
    await userEvent.click(screen.getByRole('button', { name: '開始查核' }))
    await waitFor(() => expect(screen.getByText('結果頁')).toBeInTheDocument())
    expect(sessionStorage.getItem('checkDraft')).toBeNull()
    expect(localStorage.getItem('checkHistory') ?? '').not.toContain('我的秘密訊息')
  })
})
