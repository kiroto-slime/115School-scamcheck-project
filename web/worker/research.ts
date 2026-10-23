/** 研究流程：案例挑選、固定分組、輔助資訊 */
import { analyzeText } from './rules'

export interface CaseRow {
  case_id: string
  case_version: string
  title: string
  simulated_content: string
  verified_label: 'scam' | 'legit'
  label_basis: string
  difficulty: string
  category: string
  reviewer_status: string
}

export const GENERAL_TIPS = [
  '遇到要求匯款、轉帳或購買點數的訊息，先停下來查證。',
  '不要提供驗證碼、密碼或證件照片給任何人。',
  '不要點擊不明連結，改用官方 App 或官方網站查詢。',
  '有疑問可撥打 165 反詐騙專線，或詢問家人、老師。',
]
export const PHASES = ['pre', 'post_initial', 'post_assisted'] as const
export const ASSISTANCE_BY_GROUP: Record<string, string> = { A: 'general_tips', B: 'system_evidence' }

export async function eligibleCases(db: D1Database, formal: boolean): Promise<CaseRow[]> {
  const sql = formal ? "SELECT * FROM research_cases WHERE reviewer_status = 'approved'" : "SELECT * FROM research_cases WHERE reviewer_status != 'rejected'"
  return (await db.prepare(sql).all<CaseRow>()).results
}

/** 前測與後測使用「不同但難度相同」的案例，避免同題重複作答造成假改善 */
export function pickCasePair(cases: CaseRow[], rand: () => number = Math.random): [CaseRow, CaseRow] | null {
  const byDiff = new Map<string, CaseRow[]>()
  for (const c of cases) byDiff.set(c.difficulty, [...(byDiff.get(c.difficulty) ?? []), c])
  const pools = [...byDiff.values()].filter((v) => v.length >= 2)
  if (!pools.length) return null
  const pool = [...pools[Math.floor(rand() * pools.length)]]
  const a = pool.splice(Math.floor(rand() * pool.length), 1)[0]
  const b = pool[Math.floor(rand() * pool.length)]
  return [a, b]
}

export async function assignGroup(db: D1Database, mode: string, isDemo: boolean): Promise<'A' | 'B'> {
  if (mode === 'A' || mode === 'B') return mode
  const rows = (await db.prepare('SELECT experiment_group g, COUNT(*) n FROM research_participants WHERE is_demo = ? GROUP BY experiment_group').bind(isDemo ? 1 : 0).all<{ g: string; n: number }>()).results
  const count = (g: string) => rows.find((r) => r.g === g)?.n ?? 0
  if (count('A') === count('B')) return Math.random() < 0.5 ? 'A' : 'B'
  return count('A') < count('B') ? 'A' : 'B'
}

export function buildAssistance(group: string, c: CaseRow) {
  if (group === 'A') return { type: 'general_tips', title: '一般防詐提醒', tips: GENERAL_TIPS }
  const r = analyzeText(c.simulated_content)
  return {
    type: 'system_evidence', title: '本網站的風險解釋', risk_level: r.risk_level, risk_score: r.risk_score,
    features: r.features, basis: r.basis, source_note: '研究模擬案例不進行外部 Cofacts 查詢。', disclaimer: '風險指數為規則加權分數，不是詐騙機率。',
  }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去除易混淆字元
export function newResearchId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return 'R' + [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}
