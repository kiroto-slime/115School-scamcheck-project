import { studyMessage } from './studyMessages'
import { useLanguage } from '../language'
import { useState, type FormEvent } from 'react'
import { ApiError, postJson } from '../api'
import { Alert, Section } from '../components/ui'

const init = { respondent_role: 'student', product: 'A', perceived_value: '3', most_needed_feature: 'quick_check', teacher_would_use: '',
  verbal_interest: false, trial_intent: false, payment_intent: false, acceptable_price_range: 'free_only' }

export default function Products() {
  const { lang, t } = useLanguage()
  const products = [
    ['A', t("免費防詐查核工具", "Free scam check", "無料の詐欺チェックツール", "무료 사기 확인 도구"), t("任何人都能使用的訊息查核與風險解釋（即本網站）。", "Check a message and understand its risks. This website is free for everyone.", "誰でも無料でメッセージを確認し、リスクの解説を読めるこのサイトです。", "누구나 메시지를 확인하고 위험 요인을 알아볼 수 있는 이 웹사이트입니다.")],
    ['B', t("防詐教材與案例包", "Scam prevention teaching kit", "詐欺対策教材・事例集", "사기 예방 수업 자료와 사례집"), t(
      "給老師課堂使用的模擬案例、學習單與解說（只使用自行撰寫或經授權的案例）。",
      "Classroom scenarios, worksheets and explanations for teachers. All cases are original or used with permission.",
      "教員向けの模擬事例、ワークシート、解説です。自作または使用許諾のある事例のみを扱います。",
      "교사용 모의 사례, 학습지, 해설로 구성되며 직접 작성했거나 사용 허가를 받은 사례만 포함합니다.",
    )],
    ['C', t("防詐趨勢分析與教育報告", "Scam trends and education reports", "詐欺の傾向分析と教育レポート", "사기 동향 분석 및 교육 보고서"), t(
      "以彙總統計呈現常見詐騙特徵與青少年易忽略的地方（不含任何個別投稿）。",
      "Aggregate statistics on common scam tactics and signs teenagers often miss. Individual submissions are excluded.",
      "個々の投稿を含めず、集計データからよくある詐欺の特徴や若者が見落としやすい点を紹介します。",
      "개별 제보를 제외한 집계 통계로 흔한 사기 수법과 청소년이 놓치기 쉬운 징후를 보여 줍니다.",
    )],
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
      <h1>{t("產品構想與需求調查", "Product ideas and survey", "製品アイデアとニーズ調査", "제품 구상과 수요 조사")}</h1>
      <Alert kind="info">{t(
        "本階段只做產品概念展示與需求研究，沒有任何付費或販售功能。",
        "These are product ideas for a research survey. Nothing is sold and no payment is taken.",
        "この段階では製品アイデアの紹介とニーズ調査のみを行います。販売や決済はありません。",
        "현재는 제품 아이디어를 소개하고 수요를 조사하는 단계입니다. 판매나 결제 기능은 없습니다.",
      )}</Alert>
      <div className="grid gap-3 sm:grid-cols-3">
        {products.map(([id, name, desc]) => (
          <div key={id} className="card space-y-1">
            <p className="text-sm font-semibold text-teal-700">{t(`產品 ${id}`, `Product ${id}`, `製品 ${id}`, `제품 ${id}`)}</p>
            <h2>{name}</h2>
            <p className="text-sm text-slate-600">{desc}</p>
          </div>
        ))}
      </div>
      <Section title={t("匿名需求問卷（約 1 分鐘）", "Anonymous survey (about 1 minute)", "匿名ニーズ調査（約1分）", "익명 수요 설문(약 1분)")}>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <label className="block"><span className="label">{t("你的身分", "Your role", "回答者の立場", "응답자 구분")}</span>
            <select className="input min-h-11" value={f.respondent_role} onChange={(e) => set('respondent_role', e.target.value)}>
              <option value="student">{t("學生", "Student", "生徒・学生", "학생")}</option><option value="teacher">{t("教師", "Teacher", "教員", "교사")}</option><option value="parent">{t("家長", "Parent or guardian", "保護者", "학부모")}</option><option value="other">{t("其他", "Other", "その他", "기타")}</option>
            </select></label>
          <label className="block"><span className="label">{t("最感興趣的產品", "Which product interests you most?", "最も関心のある製品", "가장 관심 있는 제품")}</span>
            <select className="input min-h-11" value={f.product} onChange={(e) => set('product', e.target.value)}>
              {products.map(([id, name]) => <option key={id} value={id}>{id}. {name}</option>)}
            </select></label>
          <label className="block"><span className="label">{t("你覺得它的價值（1 低 – 5 高）", "How valuable is it to you? (1 low – 5 high)", "どのくらい価値を感じますか（1 低い～5 高い）", "이 제품을 얼마나 가치 있게 생각하나요? (1 낮음~5 높음)")}</span>
            <select className="input min-h-11" value={f.perceived_value} onChange={(e) => set('perceived_value', e.target.value)}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select></label>
          <label className="block"><span className="label">{t("最需要的功能", "Which feature do you need most?", "最も必要な機能", "가장 필요한 기능")}</span>
            <select className="input min-h-11" value={f.most_needed_feature} onChange={(e) => set('most_needed_feature', e.target.value)}>
              <option value="quick_check">{t("快速查核", "Quick check", "クイックチェック", "빠른 확인")}</option><option value="case_library">{t("案例資料庫", "Case library", "事例データベース", "사례 자료실")}</option><option value="teaching_material">{t("課堂教材", "Classroom materials", "授業用教材", "수업 자료")}</option>
              <option value="trend_report">{t("趨勢報告", "Trend reports", "傾向レポート", "동향 보고서")}</option><option value="other">{t("其他", "Other", "その他", "기타")}</option>
            </select></label>
          <label className="block"><span className="label">{t("（教師）是否願意在課堂使用", "For teachers: Would you use it in class?", "教員の方：授業で利用したいですか", "교사인 경우 수업에 활용할 의향이 있나요?")}</span>
            <select className="input min-h-11" value={f.teacher_would_use} onChange={(e) => set('teacher_would_use', e.target.value)}>
              <option value="">{t("不適用", "Not applicable", "該当しない", "해당 없음")}</option><option value="yes">{t("願意", "Yes", "利用したい", "예")}</option><option value="no">{t("不願意", "No", "利用しない", "아니요")}</option>
            </select></label>
          <label className="block"><span className="label">{t("可接受的價格範圍（新臺幣）", "Acceptable price (New Taiwan dollars)", "許容できる価格（台湾ドル）", "적정 가격대(대만 달러)")}</span>
            <select className="input min-h-11" value={f.acceptable_price_range} onChange={(e) => set('acceptable_price_range', e.target.value)}>
              <option value="free_only">{t("只接受免費", "Free only", "無料のみ", "무료만")}</option><option value="1-99">{t("1–99 元", "NT$1–99", "1～99台湾ドル", "1~99 대만 달러")}</option><option value="100-299">{t("100–299 元", "NT$100–299", "100～299台湾ドル", "100~299 대만 달러")}</option>
              <option value="300-999">{t("300–999 元", "NT$300–999", "300～999台湾ドル", "300~999 대만 달러")}</option><option value="1000+">{t("1000 元以上", "NT$1,000 or more", "1,000台湾ドル以上", "1,000 대만 달러 이상")}</option>
            </select></label>
          {([['verbal_interest', t("我對這個產品有興趣", "I am interested in this product", "この製品に関心がある", "이 제품에 관심이 있습니다")], ['trial_intent', t("我願意實際試用", "I would try it", "実際に試してみたい", "직접 사용해 보고 싶습니다")], ['payment_intent', t("我願意付費使用", "I would pay to use it", "有料でも利用したい", "비용을 내고 사용할 의향이 있습니다")]] as const).map(([k, l]) => (
            <label key={k} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={f[k]} onChange={(e) => set(k, e.target.checked)} /> {l}
            </label>
          ))}
          <p className="text-xs text-slate-500 sm:col-span-2">{t(
            "「願意付費」只是意願，研究中會與實際試用、實際付款分開統計，不會被當成營收。",
            "Willingness to pay is recorded separately from actual trials and payments. It does not count as revenue.",
            "支払いの意向は、実際の試用・支払いと分けて集計し、売上には含めません。",
            "지불 의향은 실제 체험 및 결제와 구분해 집계하며 매출로 계산하지 않습니다.",
          )}</p>
          <button type="submit" className="btn-primary sm:col-span-2 sm:w-fit">{t("送出問卷", "Submit survey", "アンケートを送信", "설문 제출")}</button>
          {msg && <div className="sm:col-span-2"><Alert kind={msg.kind}>{studyMessage(lang, msg.text)}</Alert></div>}
        </form>
      </Section>
    </div>
  )
}
