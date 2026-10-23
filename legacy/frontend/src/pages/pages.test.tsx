import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Check, { validateFile } from './Check'
import Result from './Result'
import Research from './Research'
import type { AnalysisResult } from '../api'

const health = { status: 'ok', version: '0.1.0', rule_version: 'r', limits: { max_text_chars: 10000, max_image_mb: 10, max_video_mb: 20, max_video_seconds: 30 },
  modes: { cofacts: 'mock', ai: 'disabled', ai_model: null, ocr: 'available', ffmpeg: 'available', research_mode: 'simulation', research_collection_enabled: true, admin_configured: true } }

const result: AnalysisResult = {
  analysis_id: 'a'.repeat(32), created_at: '2026-10-22T00:00:00', media_type: 'text', risk_level: '高', risk_score: 80, risk_tags: ['urgency'],
  analysis_status: 'completed', rule_version: 'rules-test', external_ai_used: false, consent_research: false,
  score_disclaimer: '風險指數為規則加權分數，不是經統計校準的詐騙機率，也不是司法認定。',
  cofacts: { status: 'not_configured', mode: 'mock', message: 'Demo 模式：尚未設定 Cofacts 憑證，未進行查詢（尚無查核資料）', license: 'CC BY-SA 4.0', matches: [] },
  features: [{ feature_id: 'urgency', label: '急迫時間壓力', description: 'd', triggers: ['立即'], rule_version: 'rules-test', human_verified: false }],
  basis: ['偵測到「急迫時間壓力」：立即'], safe_actions: ['停下來查證'], ai: { provider: 'disabled', status: 'disabled', is_demo: false, summary: '尚未設定 Gemini API 金鑰', external: false },
  media: {}, checked_at: '2026-10-22T00:00:00Z',
}

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = url === '/api/health' ? health : handler(url, init)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
}
afterEach(() => vi.unstubAllGlobals())

describe('validateFile', () => {
  it('rejects unsupported formats and oversize files', () => {
    expect(validateFile(new File(['x'], 'a.gif', { type: 'image/gif' }), 'image', 10)).toMatch('格式不支援')
    expect(validateFile(new File(['x'], 'a.avi'), 'video', 20)).toMatch('格式不支援')
    const big = new File([new Uint8Array(2 * 1024 * 1024)], 'a.png', { type: 'image/png' })
    expect(validateFile(big, 'image', 1)).toMatch('超過 1 MB')
    expect(validateFile(new File(['x'], 'a.png', { type: 'image/png' }), 'image', 10)).toBeNull()
  })
})

describe('Check page', () => {
  it('shows error on empty submit and navigates to result after analysis', async () => {
    const calls: string[] = []
    mockFetch((url) => { calls.push(url); return result })
    render(<MemoryRouter initialEntries={['/check']}><Routes><Route path="/check" element={<Check />} /><Route path="/result/:id" element={<p>結果頁</p>} /></Routes></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: '開始查核' }))
    expect(screen.getByRole('alert')).toHaveTextContent('請輸入要查核的訊息內容')
    await userEvent.type(screen.getByLabelText(/貼上可疑訊息/), '請立即匯款')
    await userEvent.click(screen.getByRole('button', { name: '開始查核' }))
    await waitFor(() => expect(screen.getByText('結果頁')).toBeInTheDocument())
    expect(calls).toContain('/api/analyze/text')
    expect(calls).not.toContain('/api/consent') // 未勾選 B 不建立研究紀錄
  })

  it('consent C is disabled until B is checked', async () => {
    mockFetch(() => ({}))
    render(<MemoryRouter><Check /></MemoryRouter>)
    const c = screen.getByLabelText(/C.（自願）/)
    expect(c).toBeDisabled()
    await userEvent.click(screen.getByLabelText(/B.（自願）/))
    expect(c).toBeEnabled()
  })
})

describe('Result page', () => {
  it('renders sections in the required order without fabricated Cofacts data', async () => {
    mockFetch(() => result)
    render(<MemoryRouter initialEntries={['/result/' + 'a'.repeat(32)]}><Routes><Route path="/result/:id" element={<Result />} /></Routes></MemoryRouter>)
    await screen.findByText('Cofacts 查核結果')
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace(/^\d/, ''))
    expect(headings).toEqual(['Cofacts 查核結果', '規則分析結果', 'AI 分析（Google Gemini）', '綜合風險指數', '建議的安全行動', '查核來源與時間', '這次結果對你有幫助嗎？'])
    expect(screen.getByText(/尚無查核資料/)).toBeInTheDocument()
    expect(screen.queryByText(/在 Cofacts 查看原始查核/)).not.toBeInTheDocument()
    expect(screen.getByText(/尚未經人工驗證/)).toBeInTheDocument()
    expect(screen.queryByText(/詐騙機率\s*\d/)).not.toBeInTheDocument()
  })
})

describe('Result page with Gemini', () => {
  it('shows AI judgement separately from the rule score', async () => {
    const withAi = { ...result, external_ai_used: true, ai: { provider: 'gemini', status: 'ok', is_demo: false, external: true, model: 'gemini-3.8-flash',
      summary: '冒充客服索取驗證碼。', risk_level: '高', risk_points: ['索取驗證碼'], advice: ['不要提供驗證碼'], media_description: null } }
    mockFetch(() => withAi)
    render(<MemoryRouter initialEntries={['/result/' + 'a'.repeat(32)]}><Routes><Route path="/result/:id" element={<Result />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('冒充客服索取驗證碼。')).toBeInTheDocument()
    expect(screen.getByText(/不列入下方的規則風險指數/)).toBeInTheDocument()
    expect(screen.getByText('不要提供驗證碼')).toBeInTheDocument()
  })
})

describe('Research page', () => {
  it('requires consent B before starting', async () => {
    mockFetch(() => ({}))
    render(<MemoryRouter><Research /></MemoryRouter>)
    const start = screen.getByRole('button', { name: '同意並開始' })
    expect(start).toBeDisabled()
    await userEvent.click(screen.getByLabelText(/我自願將匿名作答資料/))
    expect(start).toBeEnabled()
  })
})
