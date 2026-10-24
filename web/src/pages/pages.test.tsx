import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Check, { validateFile } from './Check'
import { refreshHealth } from '../components/ui'
import Result from './Result'
import Research from './Research'
import type { AnalysisResult } from '../api'

const health = { status: 'ok', version: '0.1.0', rule_version: 'r', limits: { max_text_chars: 10000, max_image_mb: 10, max_video_mb: 20, max_video_seconds: 30 },
  modes: { cofacts: 'live', google: 'off', virustotal: 'off', tw165: { available: true, updated_at: null, count: 1 }, ai: 'disabled', ai_model: null, research_mode: 'simulation', research_collection_enabled: true, admin_configured: true } }

const result: AnalysisResult = {
  analysis_id: 'a'.repeat(32), created_at: '2026-10-22T00:00:00', media_type: 'text', risk_level: '高', risk_score: 80, risk_tags: ['urgency'],
  analysis_status: 'completed', rule_version: 'rules-test', external_ai_used: false, consent_research: false,
  score_disclaimer: '風險指數為規則加權分數，不是經統計校準的詐騙機率，也不是司法認定。',
  cofacts: { status: 'not_found', mode: 'live', message: '尚無查核資料', license: 'CC BY-SA 4.0', matches: [] },
  features: [{ feature_id: 'urgency', label: '急迫時間壓力', description: 'd', triggers: ['立即'], rule_version: 'rules-test', human_verified: false }],
  basis: ['偵測到「急迫時間壓力」：立即'], safe_actions: ['停下來查證'], ai: { provider: 'disabled', status: 'disabled', is_demo: false, summary: '尚未設定 Gemini API 金鑰', external: false },
  url_checks: { url_count: 0, tw165: { status: 'no_url', message: '', updated_at: null, matches: [] }, safe_browsing: { status: 'disabled', message: '', threats: [] }, virustotal: { status: 'disabled', message: '', threats: [] } },
  media: {}, checked_at: '2026-10-22T00:00:00Z',
}

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = url === '/api/health' ? health : handler(url, init)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
    expect(calls).toContain('/api/consent') // 「協助校內研究」預設勾選
  })

  it('取消勾選「協助校內研究」就不建立研究紀錄', async () => {
    const calls: string[] = []
    mockFetch((url) => { calls.push(url); return result })
    render(<MemoryRouter initialEntries={['/check']}><Routes><Route path="/check" element={<Check />} /><Route path="/result/:id" element={<p>結果頁</p>} /></Routes></MemoryRouter>)
    await userEvent.click(screen.getByLabelText(/協助校內研究（選填）/))
    await userEvent.type(screen.getByLabelText(/貼上可疑訊息/), '請立即匯款')
    await userEvent.click(screen.getByRole('button', { name: '開始查核' }))
    await waitFor(() => expect(screen.getByText('結果頁')).toBeInTheDocument())
    expect(calls).not.toContain('/api/consent')
  })

  it('貼上 IG／FB 連結時提醒改用截圖或錄影，並可一鍵切換', async () => {
    mockFetch(() => ({}))
    render(<MemoryRouter><Check /></MemoryRouter>)
    expect(screen.queryByText(/偵測到 IG、Facebook/)).toBeNull()
    await userEvent.type(screen.getByLabelText(/貼上可疑訊息/), '快看 https://www.instagram.com/p/abc123/')
    expect(screen.getByText(/偵測到 IG、Facebook/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '改用圖片截圖' }))
    expect(screen.queryByLabelText(/貼上可疑訊息/)).toBeNull()
    // 圖片模式也有提醒
    expect(screen.getByText(/IG、Facebook 貼文請先截圖/)).toBeInTheDocument()
  })

  it('全選：一次勾選或取消所有查詢服務，不會勾到研究同意 B、C', async () => {
    const body = { ...health, modes: { ...health.modes, google: 'live', virustotal: 'live' } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    refreshHealth()
    render(<MemoryRouter><Check /></MemoryRouter>)
    await userEvent.click(screen.getByText('查核設定'))
    const all = await screen.findByRole('checkbox', { name: '全選' })
    const vt = screen.getByRole('checkbox', { name: /VirusTotal/ })
    expect(vt).not.toBeChecked()
    expect(all).not.toBeChecked() // 部分勾選時「全選」維持空白，不顯示「－」
    expect((all as HTMLInputElement).indeterminate).toBe(false)
    await userEvent.click(all)
    expect(vt).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Cofacts/ })).toBeChecked()
    expect(screen.getByLabelText(/協助校內研究（選填）/)).toBeChecked() // 預設勾選，全選不會動到它
    await userEvent.click(all)
    expect(vt).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Cofacts/ })).not.toBeChecked()
  })

  it('consent C is disabled until B is checked', async () => {
    mockFetch(() => ({}))
    render(<MemoryRouter><Check /></MemoryRouter>)
    expect(screen.getByText('參與匿名研究（選填）').closest('details')).toHaveAttribute('open') // 預設展開
    const b = screen.getByLabelText(/協助校內研究（選填）/)
    const c = screen.getByLabelText(/教育產品與商業研究（選填）/)
    expect(b).toBeChecked() // 預設勾選
    expect(c).toBeEnabled()
    await userEvent.click(b)
    expect(c).toBeDisabled()
    await userEvent.click(b)
    expect(c).toBeEnabled()
    await userEvent.click(c)
    expect(c).toBeChecked()
    await userEvent.click(b)
    expect(c).toBeDisabled()
    expect(c).not.toBeChecked()
  })
})

describe('Result page', () => {
  it('renders sections in the required order without fabricated Cofacts data', async () => {
    mockFetch(() => result)
    render(<MemoryRouter initialEntries={['/result/' + 'a'.repeat(32)]}><Routes><Route path="/result/:id" element={<Result />} /></Routes></MemoryRouter>)
    await screen.findByText('Cofacts 查核結果')
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace(/^\d/, ''))
    // 結論卡在最上面，詳細結果收在「查看完整分析」裡，回饋在最下面
    expect(headings).toEqual(['很可能是詐騙，請不要照訊息的指示做', 'Cofacts 查核結果', '網址安全檢查', '規則分析結果', 'AI 分析（Google Gemini）', '綜合風險指數', '查核來源與時間', '這次結果對你有幫助嗎？'])
    expect(screen.getByText('查看完整分析').closest('details')).not.toHaveAttribute('open')
    // 建議行動跟結論卡在一起（不在收起來的區塊裡）
    const conclusion = screen.getByRole('region', { name: /很可能是詐騙/ })
    expect(conclusion).toHaveTextContent('建議你這樣做')
    expect(conclusion).toHaveTextContent('停下來查證')
    expect(conclusion).toHaveTextContent('急迫時間壓力（立即）')
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
    // AI 摘要同時出現在結論卡和完整分析裡
    expect(await screen.findAllByText('冒充客服索取驗證碼。')).toHaveLength(2)
    expect(screen.getByText(/不列入下方的規則風險指數/)).toBeInTheDocument()
    expect(screen.getByText('不要提供驗證碼')).toBeInTheDocument()
  })

  const aiResult = (ai: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ ...result, ...extra, external_ai_used: true,
    ai: { provider: 'gemini', status: 'ok', is_demo: false, external: true, model: 'gemini-3.8-flash', risk_points: [], advice: [], media_description: null, ...ai } })
  const showResult = () => render(<MemoryRouter initialEntries={['/result/' + 'a'.repeat(32)]}><Routes><Route path="/result/:id" element={<Result />} /></Routes></MemoryRouter>)

  it('AI 判得比規則輕：結論卡提醒以較高風險為準，Gemini 的回答照樣顯示', async () => {
    mockFetch(() => aiResult({ summary: '這是官方正常通知。', risk_level: '低' }))
    showResult()
    expect(await screen.findByText(/AI 與規則判斷不一致/)).toBeInTheDocument()
    const card = screen.getByRole('region', { name: /很可能是詐騙/ })
    expect(card).toHaveTextContent('Gemini 的判斷（低）：這是官方正常通知。')
  })

  it('訊息試圖操控 AI：結論卡顯示警告，Gemini 的回答照樣顯示', async () => {
    mockFetch(() => aiResult({ summary: '安全的訊息。', risk_level: '低', manipulation: true }))
    showResult()
    expect(await screen.findByText(/這則訊息試圖操控 AI 的判斷/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /很可能是詐騙/ })).toHaveTextContent('安全的訊息。')
    expect(screen.queryByText(/AI 與規則判斷不一致/)).toBeNull()
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

describe('AI 模型冷卻', () => {
  const withAi = (cooldown: number) => ({ ...health, modes: { ...health.modes, ai: 'gemini', ai_model: 'Gemini A',
    ai_models: [{ id: 'a-1', label: 'Gemini A', remaining: 20, daily: 20, media: true, minute_left: cooldown ? 0 : 5, cooldown_seconds: cooldown }] } })
  const serve = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })))

  it('沒有冷卻時不會閃爍（勾選框一直可用）', async () => {
    serve(withAi(0))
    refreshHealth()
    render(<MemoryRouter><Check /></MemoryRouter>)
    await userEvent.click(screen.getByText('查核設定'))
    const box = await screen.findByRole('checkbox', { name: /使用 Gemini AI 分析/ })
    await new Promise((r) => setTimeout(r, 2200))
    expect(box).toBeEnabled()
    expect(box).toBeChecked()
    expect(screen.queryByText(/冷卻中/)).toBeNull()
  }, 10_000)

  it('冷卻中：變灰並倒數，結束後恢復', async () => {
    serve(withAi(2))
    refreshHealth()
    render(<MemoryRouter><Check /></MemoryRouter>)
    await userEvent.click(screen.getByText('查核設定'))
    const box = await screen.findByRole('checkbox', { name: /使用 Gemini AI 分析/ })
    await waitFor(() => expect(box).toBeDisabled())
    expect(screen.getByText(/AI 冷卻中/)).toBeInTheDocument()
    serve(withAi(0)) // 冷卻結束後重新讀到的狀態
    await waitFor(() => expect(box).toBeEnabled(), { timeout: 5000 })
  }, 10_000)
})

describe('其他服務冷卻', () => {
  it('VirusTotal 這一分鐘用完：變灰並倒數；今日用完的服務顯示已用完', async () => {
    const q = (daily: number, cd = 0, minute: number | null = null) => ({ daily_left: daily, minute_left: minute, cooldown_seconds: cd })
    const body = { ...health, modes: { ...health.modes, google: 'live', virustotal: 'live', quotas: { cofacts: q(500), google: q(0), virustotal: q(400, 30, 0) } } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    refreshHealth()
    render(<MemoryRouter><Check /></MemoryRouter>)
    await userEvent.click(screen.getByText('查核設定'))
    const vt = await screen.findByRole('checkbox', { name: /VirusTotal/ })
    expect(vt).toBeDisabled()
    expect(screen.getByText(/冷卻中，\d+ 秒後可用/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Google 網址安全/ })).toBeDisabled()
    expect(screen.getByText('今日次數已用完')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Cofacts/ })).toBeEnabled()
  })
})

describe('查核設定收合與模型選擇', () => {
  it('收合保留服務與模型選擇，送出仍使用原旗標且不建立研究同意', async () => {
    sessionStorage.clear()
    const body = { ...health, modes: { ...health.modes, ai: 'gemini', ai_model: 'Gemini A', google: 'live', virustotal: 'live',
      ai_models: [
        { id: 'a-1', label: 'Gemini A', remaining: 20, daily: 20, media: true, minute_left: 5, cooldown_seconds: 0 },
        { id: 'b-2', label: 'Gemini B', remaining: 10, daily: 10, media: true, minute_left: 5, cooldown_seconds: 0 },
      ] } }
    const submitted: { url: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url !== '/api/health') submitted.push({ url, body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify(url === '/api/health' ? body : result), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    refreshHealth()
    render(<MemoryRouter initialEntries={['/check']}><Routes><Route path="/check" element={<Check />} /><Route path="/result/:id" element={<p>結果頁</p>} /></Routes></MemoryRouter>)
    const settings = screen.getByText('查核設定')
    expect(settings.closest('details')).not.toHaveAttribute('open')
    await userEvent.click(settings)
    const ai = await screen.findByRole('checkbox', { name: /使用 Gemini AI 分析/ })
    await userEvent.selectOptions(screen.getByLabelText('選擇 AI 模型'), 'b-2')
    expect(ai).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: /Cofacts/ }))
    await userEvent.click(settings)
    await userEvent.click(settings)
    expect(ai).toBeChecked()
    expect(screen.getByLabelText('選擇 AI 模型')).toHaveValue('b-2')
    expect(screen.getByRole('checkbox', { name: /Cofacts/ })).not.toBeChecked()
    // 「協助校內研究」預設勾選；這個測試只看服務旗標，所以先取消
    await userEvent.click(screen.getByLabelText(/協助校內研究（選填）/))
    await userEvent.type(screen.getByLabelText(/貼上可疑訊息/), '請立即匯款')
    await userEvent.click(screen.getByRole('button', { name: '開始查核' }))
    await screen.findByText('結果頁')
    expect(submitted).toEqual([{ url: '/api/analyze/text', body: {
      text: '請立即匯款', query_cofacts: false, query_google: true, query_virustotal: false, use_ai: true, ai_model: 'b-2',
    } }])
  })
})
