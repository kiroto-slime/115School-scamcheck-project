/**
 * 管理頁「更新 165 名單」：在瀏覽器整理政府 CSV（伺服器免費方案算不動 10MB），切成 256 片後上傳。
 * 網域正規化與分片規則必須和 scripts/build-tw165.mjs、worker/urlcheck.ts 一致。
 */
export const TW165_DATASETS = [
  { code: 's', name: '165反詐騙諮詢專線_遭停止解析涉詐網站', page: 'https://data.gov.tw/dataset/176455',
    download: 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/29E8E643-88ED-4952-B21E-BD42A3B7108C/resource/5B8ED236-9DDB-496E-B6C8-5C4B823747C7/download' },
  { code: 'i', name: '165反詐騙諮詢專線_假投資(博弈)網站', page: 'https://data.gov.tw/dataset/160055',
    download: 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/033197D4-70F4-45EB-9FB8-6D83532B999A/resource/A00B1802-6A4A-42B4-B842-B66A2D937DAE/download' },
] as const

export function normalizeHost(raw: string): string {
  let h = (raw || '').trim().toLowerCase()
  if (!h) return ''
  try {
    h = new URL(h.includes('://') ? h : 'http://' + h).hostname
  } catch {
    return ''
  }
  h = h.replace(/\.$/, '').replace(/^www\d?\./, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) ? h : ''
}

const rocMonth = (v: string) => {
  const m = /^(\d{2,3})(\d{2})$/.exec((v || '').trim())
  return m ? `${Number(m[1]) + 1911}-${m[2]}` : ''
}

export interface ParsedLists {
  map: Map<string, [string, string, string]>
  sources: { code: 's' | 'i'; name: string; page: string; rows: number }[]
}

/** 依標題列判斷是哪一份資料 */
export function parseCsvFiles(texts: string[]): ParsedLists {
  const map = new Map<string, [string, string, string]>()
  const sources: ParsedLists['sources'] = []
  for (const raw of texts) {
    const lines = raw.replace(/^﻿/, '').split(/\r?\n/)
    const header = lines[0] ?? ''
    const code = header.includes('網域') ? 's' : header.includes('網址') ? 'i' : null
    if (!code) throw new Error('看不出這是哪一份 165 資料，請確認檔案是從管理頁的連結下載的 CSV。')
    let rows = 0
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue
      const c = line.split(',').map((x) => x.replace(/^"|"$/g, '').trim())
      const host = normalizeHost(code === 's' ? c[1] : c[1])
      if (!host) continue
      const month = code === 's' ? rocMonth(c[0]) : (c[4] || '').slice(0, 7).replace('/', '-')
      const category = code === 's' ? c[2] || '' : '假投資（博弈）'
      const cur = map.get(host)
      if (cur) {
        if (!cur[0].includes(code)) cur[0] += code
        if (month > cur[1]) cur[1] = month
      } else map.set(host, [code, month, category])
      rows++
    }
    const ds = TW165_DATASETS.find((d) => d.code === code)!
    sources.push({ code, name: ds.name, page: ds.page, rows })
  }
  return { map, sources }
}

async function shardOf(host: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(host))
  return [...new Uint8Array(buf).slice(0, 1)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 切成 256 片，每 32 片組成一次上傳的內容（每行「兩碼\tJSON」） */
export async function buildUploadChunks(map: ParsedLists['map']): Promise<string[]> {
  const shards = new Map<string, Record<string, [string, string, string]>>()
  for (let i = 0; i < 256; i++) shards.set(i.toString(16).padStart(2, '0'), {})
  for (const [host, v] of map) shards.get(await shardOf(host))![host] = v
  const keys = [...shards.keys()]
  const chunks: string[] = []
  for (let i = 0; i < keys.length; i += 32) chunks.push(keys.slice(i, i + 32).map((k) => `${k}\t${JSON.stringify(shards.get(k))}`).join('\n'))
  return chunks
}
