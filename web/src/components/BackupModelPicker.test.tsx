import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { BackupModelPicker } from './BackupModelPicker'

afterEach(cleanup)

const CATALOG = { models: [
  { key: 'workers_ai:@cf/openai/gpt-oss-120b', provider: 'workers_ai', provider_label: 'Cloudflare Workers AI', model: '@cf/openai/gpt-oss-120b', label: 'GPT-OSS 120B', maker: 'OpenAI', status: 'unchecked' },
  { key: 'workers_ai:@cf/google/gemma-4-26b-a4b-it', provider: 'workers_ai', provider_label: 'Cloudflare Workers AI', model: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B', maker: 'Google', status: 'unchecked' },
  { key: 'groq:openai/gpt-oss-120b', provider: 'groq', provider_label: 'Groq', model: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', maker: 'OpenAI', status: 'available' },
  { key: 'groq:openai/gpt-oss-20b', provider: 'groq', provider_label: 'Groq', model: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', maker: 'OpenAI', status: 'missing' },
] }

function Harness({ initial, onChange }: { initial: string[]; onChange: (v: string[]) => void }) {
  const [value, setValue] = useState(initial)
  return <BackupModelPicker call={async <T,>() => CATALOG as T} value={value} onChange={(v) => { setValue(v); onChange(v) }} />
}

it('依目前順序列出已啟用的備援，並顯示 Groq 即時狀態（已下架會提醒）', async () => {
  render(<Harness initial={['groq:openai/gpt-oss-20b', 'workers_ai:@cf/openai/gpt-oss-120b']} onChange={() => {}} />)
  const list = await screen.findByRole('list', { name: '使用中的備援模型' })
  const items = within(list).getAllByRole('listitem')
  expect(items[0]).toHaveTextContent('1. Groq · GPT-OSS 20B')
  expect(items[0]).toHaveTextContent('已下架')
  expect(items[1]).toHaveTextContent('2. Cloudflare Workers AI · GPT-OSS 120B')
  expect(items[1]).toHaveTextContent('請用「測試備援 AI」確認')
  // 沒啟用的候選列在下面可加入
  expect(within(screen.getByRole('list', { name: '可加入的備援模型' })).getAllByRole('listitem')).toHaveLength(2)
})

it('可以調整順序、移除與加入，結果交給上層儲存', async () => {
  const onChange = vi.fn()
  render(<Harness initial={['workers_ai:@cf/openai/gpt-oss-120b', 'groq:openai/gpt-oss-120b']} onChange={onChange} />)
  await screen.findByRole('list', { name: '使用中的備援模型' })
  await userEvent.click(screen.getByRole('button', { name: '把 Groq GPT-OSS 120B 往上移' }))
  expect(onChange).toHaveBeenLastCalledWith(['groq:openai/gpt-oss-120b', 'workers_ai:@cf/openai/gpt-oss-120b'])
  await userEvent.click(screen.getByRole('button', { name: '移除 Cloudflare Workers AI GPT-OSS 120B' }))
  expect(onChange).toHaveBeenLastCalledWith(['groq:openai/gpt-oss-120b'])
  await userEvent.click(screen.getByRole('button', { name: '加入 Cloudflare Workers AI Gemma 4 26B' }))
  expect(onChange).toHaveBeenLastCalledWith(['groq:openai/gpt-oss-120b', 'workers_ai:@cf/google/gemma-4-26b-a4b-it'])
})

it('全部移除時提醒不會使用備援；讀取失敗時不讓頁面當掉', async () => {
  render(<Harness initial={[]} onChange={() => {}} />)
  expect(await screen.findByText(/目前沒有啟用任何備援/)).toBeVisible()
  cleanup()
  render(<BackupModelPicker call={async <T,>() => ({ nope: 1 }) as T} value={[]} onChange={() => {}} />)
  expect(await screen.findByText(/無法讀取備援模型清單/)).toBeVisible()
})
