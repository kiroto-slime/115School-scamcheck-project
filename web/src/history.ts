/**
 * 查核紀錄：只存在使用者自己的瀏覽器（localStorage），清除瀏覽資料或按「清除紀錄」就沒了。
 * 為了公用電腦的隱私，只存結果編號、時間、風險等級與主要原因，不存使用者輸入的原文或完整報告；
 * 報告內容點開時才向伺服器讀取（伺服器保存 30 天）。
 */
import type { AnalysisResult } from './api'
import { mainReasons, finalRisk } from '../shared/conclusion'

export interface CheckReceipt {
  analysis_id: string
  created_at: string
  job_status: 'pending' | 'failed'
}

export function resultSummary(data: AnalysisResult): HistoryItem {
  return { id: data.analysis_id, at: data.created_at, level: finalRisk(data).level, score: data.risk_score, media: data.media_type, reason: mainReasons(data)[0] ?? null }
}

export interface HistoryItem {
  id: string
  /** 查核時間（ISO） */
  at: string
  level: string
  score: number | null
  media: string
  /** 主要原因的第一點（由規則或外部來源產生，不是使用者原文） */
  reason: string | null
  job?: CheckReceipt['job_status']
}

const KEY = 'checkHistory'
const RECEIPT = 'checkReceipt:'
const MAX_ITEMS = 50
export const KEEP_DAYS = 30

function load(): HistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function save(items: HistoryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* 無痕模式或空間已滿：不影響查核 */
  }
}

/** 讀取紀錄；超過 30 天的（伺服器上也已刪除）自動移除 */
export function readHistory(now = Date.now()): HistoryItem[] {
  const legacy = load()
  const receipts: HistoryItem[] = []
  try {
    for (const key of Object.keys(localStorage).filter(key => key.startsWith(RECEIPT))) {
      const item = JSON.parse(localStorage.getItem(key) ?? 'null') as HistoryItem | null
      if (item && now - Date.parse(item.at) < KEEP_DAYS * 86_400_000) receipts.push(item)
      else localStorage.removeItem(key)
    }
  } catch { /* 無法讀取的裝置仍可使用結果網址。 */ }
  const all = legacy
  const fresh = all.filter((h) => now - Date.parse(h.at) < KEEP_DAYS * 86_400_000)
  if (fresh.length !== all.length) save(fresh)
  const merged = [...receipts, ...fresh.filter(item => !receipts.some(row => row.id === item.id))]
    .sort((a,b) => Date.parse(b.at) - Date.parse(a.at))
  for (const item of merged.slice(MAX_ITEMS)) removeHistory(item.id)
  return merged.slice(0, MAX_ITEMS)
}

/** 每筆各用一個鍵，多個分頁同時收到回覆時不會覆寫彼此。 */
export function saveReceipt(item: HistoryItem): boolean {
  try {
    localStorage.setItem(RECEIPT + item.id, JSON.stringify(item))
    return true
  } catch { return false }
}

export function addHistory(item: HistoryItem) {
  try {
    if (localStorage.getItem(RECEIPT + item.id)) { saveReceipt(item); return }
  } catch { return }
  save([item, ...load().filter(h => h.id !== item.id)].slice(0, MAX_ITEMS))
}

export function removeHistory(id: string) {
  try { localStorage.removeItem(RECEIPT + id) } catch { /* 儲存空間不可用 */ }
  save(load().filter(h => h.id !== id))
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY)
    for (const key of Object.keys(localStorage).filter(key => key.startsWith(RECEIPT))) localStorage.removeItem(key)
  } catch {
    /* 略過 */
  }
}
