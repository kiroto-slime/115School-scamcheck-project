import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { BackupAiTest } from './BackupAiTest'

afterEach(cleanup)

it('按下後逐一列出每個備援模型的結果：成功顯示等級與秒數、失敗顯示原因、沒金鑰顯示略過', async () => {
  const requests = vi.fn(async (_url: string, _init?: RequestInit) => ({ results: [
    { key: 'workers_ai:@cf/openai/gpt-oss-120b', provider: 'workers_ai', provider_label: 'Cloudflare Workers AI', enabled: true, model: '@cf/openai/gpt-oss-120b', label: 'GPT-OSS 120B', status: 'ok', seconds: 4.2, risk_level: '高', summary: '冒充客服要求操作 ATM。' },
    { key: 'workers_ai:@cf/google/gemma-4-26b-a4b-it', provider: 'workers_ai', provider_label: 'Cloudflare Workers AI', enabled: false, model: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B', status: 'error', seconds: 1.1, message: 'Workers AI 暫時無法使用。（503）' },
    { provider: 'groq', model: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', status: 'skipped', message: '尚未設定 GROQ_API_KEY，自動略過。' },
  ] }))
  render(<BackupAiTest call={async <T,>(url: string, init?: RequestInit) => await requests(url, init) as T} />)
  await userEvent.click(screen.getByRole('button', { name: '測試備援 AI' }))
  expect(requests).toHaveBeenCalledWith('/api/admin/ai/backup-test', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByText('@cf/openai/gpt-oss-120b')).toBeVisible()
  expect(screen.getByText('（未啟用）')).toBeVisible()
  expect(screen.getByText(/成功・等級 高・4.2 秒/)).toBeVisible()
  expect(screen.getByText('冒充客服要求操作 ATM。')).toBeVisible()
  expect(screen.getByText(/失敗・Workers AI 暫時無法使用。（503）/)).toBeVisible()
  expect(screen.getByText(/略過・尚未設定 GROQ_API_KEY/)).toBeVisible()
})

it('回應格式不對時顯示測試失敗，不讓頁面當掉', async () => {
  render(<BackupAiTest call={async <T,>() => ({ ok: true }) as T} />)
  await userEvent.click(screen.getByRole('button', { name: '測試備援 AI' }))
  expect(await screen.findByText('測試沒有完成，請稍後再試一次。')).toBeVisible()
})
