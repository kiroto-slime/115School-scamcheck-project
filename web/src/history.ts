/**
 * 查核紀錄：只存在使用者自己的瀏覽器（localStorage），清除瀏覽資料或按「清除紀錄」就沒了。
 * 為了公用電腦的隱私，只存結果編號、時間、風險等級與主要原因，不存使用者輸入的原文或完整報告；
 * 報告內容點開時才向伺服器讀取（伺服器保存 30 天）。
 */
export interface HistoryItem {
  id: string
  /** 查核時間（ISO） */
  at: string
  level: string
  score: number | null
  media: string
  /** 主要原因的第一點（由規則或外部來源產生，不是使用者原文） */
  reason: string | null
}

const KEY = 'checkHistory'
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
  const all = load()
  const fresh = all.filter((h) => now - Date.parse(h.at) < KEEP_DAYS * 86_400_000)
  if (fresh.length !== all.length) save(fresh)
  return fresh
}

export function addHistory(item: HistoryItem) {
  save([item, ...readHistory().filter((h) => h.id !== item.id)].slice(0, MAX_ITEMS))
}

export function removeHistory(id: string) {
  save(readHistory().filter((h) => h.id !== id))
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 略過 */
  }
}
