import { studyMessage } from './studyMessages'
import { useLanguage } from '../language'
import { useState, type FormEvent } from 'react'
import { ApiError, postJson } from '../api'
import { Alert, Section } from '../components/ui'

const init = { respondent_role: 'student', product: 'A', perceived_value: '3', most_needed_feature: 'quick_check', teacher_would_use: '',
  verbal_interest: false, trial_intent: false, payment_intent: false, acceptable_price_range: 'free_only' }

export default function Products() {
  const { t } = useLanguage()
  const products = [
    ['A', t('免費防詐查核工具'), t('任何人都能使用的訊息查核與風險解釋（即本網站）。')],
    ['B', t('防詐教材與案例包'), t('給老師課堂使用的模擬案例、學習單與解說（只使用自行撰寫或經授權的案例）。')],
    ['C', t('防詐趨勢分析與教育報告'), t('以彙總統計呈現常見詐騙特徵與青少年易忽略的地方（不含任何個別投稿）。')],
  ] as const
  const [f, setF] = useState(init)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const set = (k: keyof typeof init, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const r = await postJson<{ message: string }>('/api/survey', {
        ...f, perceived_value: Number(f.perceived_value), teacher_would_use: f.teacher_would_use === '' ? null : f.teacher_would_use === 'yes',
      })
      setMsg({ kind: 'success', text: r.message })
      setF(init)
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : '送出失敗' })
    }
  }

  return (
    <div className="space-y-4">
      <h1>{t('產品構想與需求調查')}</h1>
      <Alert kind="info">{t('本階段只做產品概念展示與需求研究，沒有任何付費或販售功能。')}</Alert>
      <div className="grid gap-3 sm:grid-cols-3">
        {products.map(([id, name, desc]) => (
          <div key={id} className="card space-y-1">
            <p className="text-sm font-semibold text-teal-700">{t('產品 {0}', id)}</p>
            <h2>{name}</h2>
            <p className="text-sm text-slate-600">{desc}</p>
          </div>
        ))}
      </div>
      <Section title={t('匿名需求問卷（約 1 分鐘）')}>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <label className="block"><span className="label">{t('你的身分')}</span>
            <select className="input min-h-11" value={f.respondent_role} onChange={(e) => set('respondent_role', e.target.value)}>
              <option value="student">{t('學生')}</option><option value="teacher">{t('教師')}</option><option value="parent">{t('家長')}</option><option value="other">{t('其他')}</option>
            </select></label>
          <label className="block"><span className="label">{t('最感興趣的產品')}</span>
            <select className="input min-h-11" value={f.product} onChange={(e) => set('product', e.target.value)}>
              {products.map(([id, name]) => <option key={id} value={id}>{id}. {name}</option>)}
            </select></label>
          <label className="block"><span className="label">{t('你覺得它的價值（1 低 – 5 高）')}</span>
            <select className="input min-h-11" value={f.perceived_value} onChange={(e) => set('perceived_value', e.target.value)}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select></label>
          <label className="block"><span className="label">{t('最需要的功能')}</span>
            <select className="input min-h-11" value={f.most_needed_feature} onChange={(e) => set('most_needed_feature', e.target.value)}>
              <option value="quick_check">{t('快速查核')}</option><option value="case_library">{t('案例資料庫')}</option><option value="teaching_material">{t('課堂教材')}</option>
              <option value="trend_report">{t('趨勢報告')}</option><option value="other">{t('其他')}</option>
            </select></label>
          <label className="block"><span className="label">{t('（教師）是否願意在課堂使用')}</span>
            <select className="input min-h-11" value={f.teacher_would_use} onChange={(e) => set('teacher_would_use', e.target.value)}>
              <option value="">{t('不適用')}</option><option value="yes">{t('願意')}</option><option value="no">{t('不願意')}</option>
            </select></label>
          <label className="block"><span className="label">{t('可接受的價格範圍（新臺幣）')}</span>
            <select className="input min-h-11" value={f.acceptable_price_range} onChange={(e) => set('acceptable_price_range', e.target.value)}>
              <option value="free_only">{t('只接受免費')}</option><option value="1-99">{t('1–99 元')}</option><option value="100-299">{t('100–299 元')}</option>
              <option value="300-999">{t('300–999 元')}</option><option value="1000+">{t('1000 元以上')}</option>
            </select></label>
          {([['verbal_interest', t('我對這個產品有興趣')], ['trial_intent', t('我願意實際試用')], ['payment_intent', t('我願意付費使用')]] as const).map(([k, l]) => (
            <label key={k} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={f[k]} onChange={(e) => set(k, e.target.checked)} /> {l}
            </label>
          ))}
          <p className="text-xs text-slate-500 sm:col-span-2">{t('「願意付費」只是意願，研究中會與實際試用、實際付款分開統計，不會被當成營收。')}</p>
          <button type="submit" className="btn-primary sm:col-span-2 sm:w-fit">{t('送出問卷')}</button>
          {msg && <div className="sm:col-span-2"><Alert kind={msg.kind}>{studyMessage(msg.text)}</Alert></div>}
        </form>
      </Section>
    </div>
  )
}
