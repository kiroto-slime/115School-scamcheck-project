import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { answerQuestion, siteQuestion, tipQuestion, type ChatScope } from '../chatAnswers'
import './chat.css'

export function ChatPanel({ scope, onClose }: { scope: ChatScope; onClose?: () => void }) {
  const [turns, setTurns] = useState<{ question: string; reply: string }[]>([])
  const [draft, setDraft] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const title = useId()
  const hint = useId()
  const support = scope === 'support'
  const Heading = support ? 'h2' : 'h1'
  const send = (value: string) => {
    const question = value.trim()
    if (!question) return
    const reply = answerQuestion(question, scope)
    setTurns(previous => [...previous, { question, reply }])
    setDraft('')
  }
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [turns])
  return (
    <section className={support ? 'chat-panel chat-popup' : 'chat-panel chat-page'}
      role={support ? 'dialog' : undefined} aria-labelledby={title}
      onKeyDown={event => { if (onClose && event.key === 'Escape') onClose() }}>
      <header className="chat-heading">
        <Heading id={title}>{support ? '客服問答' : '對話'}</Heading>
        {onClose && <button autoFocus className="header-button" onClick={onClose} aria-label="關閉客服問答">×</button>}
      </header>
      <div className="chat-scroll" ref={log}>
        {turns.length === 0 && <div className="chat-starters">
          {!support && <p>想了解哪種詐騙手法？</p>}
          <div>{(support ? [siteQuestion, tipQuestion] : ['驗證碼可以給客服嗎？', '朋友借錢怎麼確認？', tipQuestion]).map(q =>
            <button key={q} type="button" onClick={() => send(q)}>{q}</button>)}</div>
        </div>}
        <div role="log" aria-label="問答內容" aria-live="polite" className="chat-log">
          {turns.map(({ question, reply }, i) => <Fragment key={i}>
            <p className="chat-question"><span className="sr-only">你問：</span>{question}</p>
            <p className="chat-answer"><span className="sr-only">回覆：</span>{reply}</p>
          </Fragment>)}
        </div>
      </div>
      <form className="chat-form" onSubmit={event => { event.preventDefault(); send(draft) }}>
        <div className="chat-entry">
          <input className="input" aria-label="輸入問題" aria-describedby={hint} placeholder="輸入問題…"
            value={draft} onChange={event => setDraft(event.target.value)} autoComplete="off" spellCheck={false} maxLength={500}
            onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }} />
          <button type="submit" disabled={!draft.trim()} aria-label="送出問題" title="送出問題">
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7" /></svg>
          </button>
        </div>
        <p id={hint}>請勿輸入個資、密碼或驗證碼。</p>
      </form>
    </section>
  )
}
