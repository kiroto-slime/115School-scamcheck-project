/** 結果頁與匯出共用的結論文字，避免兩邊說明不一致。 */
export interface ConclusionData {
  cofacts?: { matches?: { reply_type?: string | null }[] }
  url_checks?: { tw165?: { status?: string }; safe_browsing?: { status?: string }; virustotal?: { status?: string } }
  fact_check?: { status?: string }
  features?: { label: string; triggers: string[] }[]
}

const HEADLINES: Record<string, string> = {
  高: '很可能是詐騙，請不要照訊息的指示做',
  中: '有可疑之處，請先查證再行動',
  低: '目前沒有明顯的詐騙特徵，但仍要小心',
  資訊不足: '資訊不足，無法判斷；不代表安全',
}
export const riskConclusion = (level: string) => HEADLINES[level] ?? HEADLINES['資訊不足']

/** 主要理由：外部來源的明確結果優先，再來是規則特徵，最多五點。 */
export function mainReasons(d: ConclusionData): string[] {
  const out: string[] = []
  const u = d.url_checks
  if (u?.tw165?.status === 'listed') out.push('網址在警政署 165 涉詐網站名單上')
  if (u?.safe_browsing?.status === 'found') out.push('Google 判定網址疑似詐騙或釣魚網站')
  if (u?.virustotal?.status === 'found') out.push('多個資安引擎判定網址有惡意')
  if (d.cofacts?.matches?.some((m) => m.reply_type === 'RUMOR')) out.push('Cofacts 有相同或相似的訊息被查核為不實')
  if (d.fact_check?.status === 'found') out.push('找到相關的事實查核報告')
  for (const f of d.features ?? []) out.push(`${f.label}（${f.triggers.slice(0, 2).join('、')}）`)
  return out.slice(0, 5)
}

const RANK: Record<string, number> = { 低: 1, 中: 2, 高: 3 }

/**
 * 比較規則與 AI 的風險等級：
 * - ai_lower：AI 判得比規則輕（可能被訊息內容誤導），結論卡不放 AI 摘要
 * - ai_higher：AI 判得比規則重，以較高風險為準
 * 任一方「資訊不足／無法判斷」時，只有 AI 判得較重才算不一致。
 */
export function aiAgreement(ruleLevel: string, aiLevel: string | null | undefined): 'agree' | 'ai_lower' | 'ai_higher' | 'unknown' {
  const ai = RANK[aiLevel ?? '']
  if (!ai) return 'unknown'
  const rule = RANK[ruleLevel] ?? 0
  if (ai === rule) return 'agree'
  return ai < rule ? 'ai_lower' : 'ai_higher'
}
