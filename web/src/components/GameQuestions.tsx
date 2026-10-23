import { useEffect, useState, type FormEvent } from 'react'
import { Alert } from './ui'

interface Question { id?: string; question: string; options: string[]; correct_index: number; explanation: string; published: boolean }
type Call = <T>(path: string, init?: RequestInit) => Promise<T | null>
const blank = (): Question => ({ question: '', options: ['', ''], correct_index: 0, explanation: '', published: false })

export function GameQuestions({ call }: { call: Call }) {
  const [rows, setRows] = useState<Question[]>([])
  const [draft, setDraft] = useState<Question>(blank)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const load = async () => { const data = await call<Question[]>('/api/admin/game-questions'); if (data) setRows(data) }
  useEffect(() => { void load() }, [call])
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('')
    const result = await call(`/api/admin/game-questions${draft.id ? `/${draft.id}` : ''}`, { method: draft.id ? 'PUT' : 'POST', body: JSON.stringify(draft) })
    if (result) { setDraft(blank()); setNotice('題目已儲存。已發布題目會供遊戲隨機抽取。'); await load() }
    setBusy(false)
  }
  return <div className="space-y-4">
    <Alert>這是獨立的教學遊戲題庫，與正式研究測驗分開。已發布的題目與答案會公開供遊戲使用；請只放自行撰寫或已授權的內容，不要填個資。玩家紀錄只存在玩家裝置。</Alert>
    {notice && <Alert>{notice}</Alert>}
    <form className="card space-y-3" onSubmit={save}>
      <h2>{draft.id ? '編輯遊戲題目' : '新增遊戲題目'}</h2>
      <label className="block">題目<textarea className="input min-h-24" maxLength={1500} required value={draft.question} onChange={e => setDraft({ ...draft, question: e.target.value })} /></label>
      {draft.options.map((value, index) => <label className="block" key={index}>選項 {index + 1}<input className="input" maxLength={300} required value={value} onChange={e => setDraft({ ...draft, options: draft.options.map((v, i) => i === index ? e.target.value : v) })} /></label>)}
      <div className="flex flex-wrap gap-2">
        {draft.options.length < 4 && <button type="button" className="btn-secondary" onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}>增加選項</button>}
        {draft.options.length > 2 && <button type="button" className="btn-secondary" onClick={() => setDraft({ ...draft, options: draft.options.slice(0, -1), correct_index: Math.min(draft.correct_index, draft.options.length - 2) })}>減少選項</button>}
      </div>
      <label className="block">正確答案<select className="input" value={draft.correct_index} onChange={e => setDraft({ ...draft, correct_index: Number(e.target.value) })}>{draft.options.map((_, i) => <option key={i} value={i}>選項 {i + 1}</option>)}</select></label>
      <label className="block">答案解析<textarea className="input min-h-24" maxLength={1500} required value={draft.explanation} onChange={e => setDraft({ ...draft, explanation: e.target.value })} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })} />發布到遊戲</label>
      <div className="flex gap-2"><button className="btn-primary" disabled={busy}>{busy ? '儲存中…' : '儲存題目'}</button>{draft.id && <button type="button" className="btn-secondary" onClick={() => setDraft(blank())}>取消編輯</button>}</div>
    </form>
    {rows.length === 0 && <p>尚無遊戲題目，請先新增並勾選發布。</p>}
    {rows.map(row => <div className="card space-y-2" key={row.id}><strong className="break-words">{row.question}</strong><p>{row.published ? '已發布' : '草稿'} · 正確答案：選項 {row.correct_index + 1}</p><button className="btn-secondary" onClick={() => setDraft({ ...row, options: [...row.options] })}>編輯題目／發布狀態</button></div>)}
  </div>
}
