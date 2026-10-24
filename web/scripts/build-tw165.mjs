/**
 * 下載警政署 165 開放資料（涉詐網站名單），切成 256 個小檔放進 public/tw165/。
 * - 建置（npm run build）時執行：每次部署都會抓最新名單。
 * - Worker 查詢時只讀其中一個小檔，不寫資料庫、不吃 CPU。
 * - Cloudflare 建置主機在國外，常連不到政府網站：下載成功時會更新 snapshot/tw165.json.gz（要提交到 Git），
 *   下載失敗時改用這份備份。連備份都沒有才寫入 available:false。
 * 更新備份：在臺灣的電腦執行 npm run data:165，再提交 snapshot/tw165.json.gz。
 * 用法：node scripts/build-tw165.mjs [--force]（24 小時內已下載過就略過）；本機預覽 npm run dev 用 --offline（不連網）。
 * 要更新備份檔：在臺灣的電腦手動執行 npm run data:165 再提交，或在管理頁上傳 CSV。
 */
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'tw165')
const SNAPSHOT = join(ROOT, 'snapshot', 'tw165.json.gz')
const SOURCES = [
  {
    code: 's', // 遭停止解析涉詐網站（刑事警察局依法停止解析）
    name: '165反詐騙諮詢專線_遭停止解析涉詐網站',
    page: 'https://data.gov.tw/dataset/176455',
    url: 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/29E8E643-88ED-4952-B21E-BD42A3B7108C/resource/5B8ED236-9DDB-496E-B6C8-5C4B823747C7/download',
    // 欄位：民國年月,網域,網站性質,法律依據,聲請單位
    row: (c) => ({ host: c[1], month: rocMonth(c[0]), category: c[2] }),
  },
  {
    code: 'i', // 假投資（博弈）網站（民眾通報統計）
    name: '165反詐騙諮詢專線_假投資(博弈)網站',
    page: 'https://data.gov.tw/dataset/160055',
    url: 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/033197D4-70F4-45EB-9FB8-6D83532B999A/resource/A00B1802-6A4A-42B4-B842-B66A2D937DAE/download',
    // 欄位：網站名稱,網址,件數,統計起始日期,統計結束日期
    row: (c) => ({ host: c[1], month: (c[4] || '').slice(0, 7).replace('/', '-'), category: '假投資（博弈）' }),
  },
]

/** 11412 → 2025-12 */
function rocMonth(v) {
  const m = /^(\d{2,3})(\d{2})$/.exec((v || '').trim())
  return m ? `${Number(m[1]) + 1911}-${m[2]}` : ''
}

/** 與 worker/urlcheck.ts 的 normalizeHost 相同規則 */
export function normalizeHost(raw) {
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

const shardOf = (host) => createHash('sha256').update(host).digest('hex').slice(0, 2)

/** 簡易 CSV（政府檔案沒有含逗號的引號欄位；有引號時去掉） */
const cells = (line) => line.split(',').map((x) => x.replace(/^"|"$/g, '').trim())

async function download(src) {
  if (process.env.TW165_OFFLINE || OFFLINE) throw new Error('本機預覽不連網下載')
  const r = await fetch(src.url, { signal: AbortSignal.timeout(90_000), headers: { 'User-Agent': 'scamcheck-build' } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const text = (await r.text()).replace(/^﻿/, '')
  const lines = text.split(/\r?\n/).slice(1).filter(Boolean)
  if (lines.length < 100) throw new Error(`資料太少（${lines.length} 行），可能下載不完整`)
  return lines.map((l) => src.row(cells(l)))
}

/** --offline：本機預覽用，不連網下載、不改備份檔，只用現有名單或 snapshot 備份 */
const OFFLINE = process.argv.includes('--offline')

async function main() {
  if (OFFLINE && existsSync(join(OUT, 'meta.json')) && JSON.parse(readFileSync(join(OUT, 'meta.json'), 'utf8')).available) {
    console.log('[165] 本機預覽：使用現有名單，不下載')
    return
  }
  const force = process.argv.includes('--force') || process.env.CI
  const metaPath = join(OUT, 'meta.json')
  if (!force && existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
    if (meta.available && Date.now() - Date.parse(meta.updated_at) < 24 * 3600_000) {
      console.log(`[165] 名單 24 小時內已下載（${meta.count} 筆），略過`)
      return
    }
  }

  /** host → [來源代碼們, 年月, 性質] */
  const map = new Map()
  const sources = []
  for (const src of SOURCES) {
    try {
      const rows = await download(src)
      let n = 0
      for (const { host, month, category } of rows) {
        const h = normalizeHost(host)
        if (!h) continue
        const cur = map.get(h)
        if (cur) {
          if (!cur[0].includes(src.code)) cur[0] += src.code
          if (month > cur[1]) cur[1] = month
        } else map.set(h, [src.code, month, category || ''])
        n++
      }
      sources.push({ code: src.code, name: src.name, page: src.page, rows: n })
      console.log(`[165] ${src.name}：${n} 筆`)
    } catch (e) {
      console.warn(`[165] 下載失敗：${src.name}（${e.message}）`)
    }
  }

  let updatedAt = new Date().toISOString()
  if (sources.length === SOURCES.length) {
    // 兩份都下載成功：更新備份
    mkdirSync(dirname(SNAPSHOT), { recursive: true })
    writeFileSync(SNAPSHOT, gzipSync(JSON.stringify({ updated_at: updatedAt, sources, domains: [...map] }), { level: 9 }))
  } else if (existsSync(SNAPSHOT)) {
    const snap = JSON.parse(gunzipSync(readFileSync(SNAPSHOT)).toString('utf8'))
    for (const [h, v] of snap.domains) if (!map.has(h)) map.set(h, v)
    for (const s of snap.sources) if (!sources.some((x) => x.code === s.code)) sources.push(s)
    updatedAt = snap.updated_at
    console.warn(`[165] 有資料下載失敗，改用備份（${snap.updated_at}）`)
  } else if (!map.size && existsSync(metaPath) && JSON.parse(readFileSync(metaPath, 'utf8')).available) {
    console.warn('[165] 全部下載失敗，保留上次的名單')
    return
  }
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const shards = new Map()
  for (const [host, v] of map) {
    const k = shardOf(host)
    if (!shards.has(k)) shards.set(k, {})
    shards.get(k)[host] = v
  }
  for (let i = 0; i < 256; i++) {
    const k = i.toString(16).padStart(2, '0')
    writeFileSync(join(OUT, `${k}.json`), JSON.stringify(shards.get(k) ?? {}))
  }
  const meta = { available: map.size > 0, updated_at: updatedAt, count: map.size, sources }
  writeFileSync(metaPath, JSON.stringify(meta))
  console.log(`[165] 完成：${map.size} 個網域（${sources.length}/${SOURCES.length} 份資料）`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
