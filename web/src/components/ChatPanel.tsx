import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { answerQuestion, createTipPicker, siteQuestion, tipQuestion, type ChatScope, type Reply } from '../chatAnswers'
import { useLanguage } from '../language'
import './chat.css'

export function ChatPanel({ scope, onClose }: { scope: ChatScope; onClose?: () => void }) {
  const { t } = useLanguage()
  const [turns, setTurns] = useState<{ question: string; reply: Reply }[]>([])
  const [draft, setDraft] = useState('')
  const [pickTip] = useState(createTipPicker)
  const log = useRef<HTMLDivElement>(null)
  const title = useId()
  const hint = useId()
  const support = scope === 'support'
  const Heading = support ? 'h2' : 'h1'
  const send = (value: string) => {
    const question = value.trim()
    if (!question) return
    const reply = answerQuestion(question, scope, pickTip)
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
        <Heading id={title}>{support ? t('客服問答','Help','ヘルプ','도움말') : t('對話','Chat','チャット','대화')}</Heading>
        {onClose && <button autoFocus className="header-button" onClick={onClose} aria-label={t('關閉客服問答','Close help','ヘルプを閉じる','도움말 닫기')}>×</button>}
      </header>
      <div className="chat-scroll" ref={log}>
        {turns.length === 0 && <div className="chat-starters">
          {!support && <p>{t('每送出一則訊息，就抽一則防詐小知識。','Send a message to get a scam prevention tip.','メッセージを送ると、詐欺対策のヒントが一つ届きます。','메시지를 보내면 사기 예방 팁을 하나 받을 수 있어요.')}</p>}
          <div>{(support ? [t(...siteQuestion), t(...tipQuestion)] : [t(...tipQuestion)]).map(q =>
            <button key={q} type="button" onClick={() => send(q)}>{q}</button>)}</div>
        </div>}
        <div role="log" aria-label={t('問答內容','Conversation','会話','대화 내용')} aria-live="polite" className="chat-log">
          {turns.map(({ question, reply }, i) => <Fragment key={i}>
            <p className="chat-question"><span className="sr-only">{t('你問：','You: ','あなた：','질문: ')}</span>{question}</p>
            <p className="chat-answer"><span className="sr-only">{t('回覆：','Reply: ','返信：','답변: ')}</span>{reply.tip && t('防詐小知識：','Safety tip: ','詐欺対策のヒント：','사기 예방 팁: ')}{t(...reply.text)}</p>
          </Fragment>)}
        </div>
      </div>
      <form className="chat-form" onSubmit={event => { event.preventDefault(); send(draft) }}>
        <div className="chat-entry">
          <input className="input" aria-label={support ? t('輸入問題','Your question','質問を入力','질문 입력') : t('輸入訊息','Your message','メッセージを入力','메시지 입력')} aria-describedby={hint} placeholder={support ? t('輸入問題…','Ask a question…','質問を入力…','질문을 입력하세요…') : t('輸入訊息，抽一則提醒…','Send a message for a tip…','入力してヒントを見る…','메시지를 입력하고 팁 받기…')}
            value={draft} onChange={event => setDraft(event.target.value)} autoComplete="off" spellCheck={false} maxLength={500}
            onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }} />
          <button type="submit" disabled={!draft.trim()} aria-label={t('送出問題','Send message','送信','보내기')} title={t('送出問題','Send message','送信','보내기')}>
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7" /></svg>
          </button>
        </div>
        <p id={hint}>{t('請勿輸入個資、密碼或驗證碼。','Keep personal details, passwords and verification codes private.','個人情報、パスワード、認証コードは入力しないでください。','개인정보, 비밀번호, 인증번호는 입력하지 마세요.')}</p>
      </form>
    </section>
  )
}
