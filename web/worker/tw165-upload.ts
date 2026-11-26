import { HttpError, newId, nowIso, sha256 } from './util'
import type { Tw165Meta } from './urlcheck'

const ACTIVE = 'tw165_active_upload'
const MANIFEST = 'tw165:manifest:'
const HOUR = 3_600_000
const shardPrefix = (version: string) => `tw165:data:${version}:`
export const uploadedShardKey = (version: string, key: string) => shardPrefix(version) + key
const startTime = (version: string) => Number(version.split('-')[0])

interface Manifest { hashes: string[]; retired?: string }

export async function activeTw165Upload(db: D1Database): Promise<Tw165Meta | null> {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(ACTIVE).first<{ value: string }>()
  return row ? JSON.parse(row.value) as Tw165Meta : null
}

// 超過兩天的版本已無法重新發布；先從主資料庫核對仍在使用的版本。
async function retiredUpload(env: Env) {
  const list = await env.TW165.list({ prefix: MANIFEST, limit: 3 })
  if (!list.keys.length) return
  const current = await activeTw165Upload(env.DB)
  return list.keys.map(k => k.name.slice(MANIFEST.length)).find(v => v !== current?.version && startTime(v) < Date.now() - 48 * HOUR)
}

export async function cleanupTw165Uploads(env: Env) {
  const version = await retiredUpload(env)
  if (!version) return
  const list = await env.TW165.list({ prefix: shardPrefix(version), limit: 32 })
  await Promise.all(list.keys.map(k => env.TW165.delete(k.name)))
  if (list.list_complete) await env.TW165.delete(MANIFEST + version)
}

export async function startTw165Upload(env: Env, hashes: string[]) {
  const version = `${Date.now()}-${newId()}`
  const manifest: Manifest = { hashes, retired: await retiredUpload(env) }
  await env.TW165.put(MANIFEST + version, JSON.stringify(manifest))
  return version
}

export function checkUploadVersion(version: string | undefined): asserts version is string {
  if (!version || !/^\d{13}-[a-f0-9]{32}$/.test(version)) throw new HttpError(409, '請重新整理管理頁，再選擇檔案更新名單。')
  if (startTime(version) < Date.now() - 2 * HOUR || startTime(version) > Date.now() + 60_000)
    throw new HttpError(410, '這次上傳已過期，請重新選擇檔案更新。')
}

/** 每次只檢查一片。分片須符合開始上傳時的摘要，重送只能寫入相同內容。 */
export async function storeTw165Shard(env: Env, version: string, key: string, text: string) {
  const manifest = await env.TW165.get<Manifest>(MANIFEST + version, 'json')
  if (!manifest) return { pending: true }
  const digest = Array.from(await sha256(text), b => b.toString(16).padStart(2, '0')).join('')
  if (digest !== manifest.hashes[parseInt(key, 16)]) throw new HttpError(422, '分片內容與原始檔案不符，請重新選擇檔案。')
  const invalid = () => new HttpError(422, '名單分片的網域或欄位格式不正確，請重新下載政府 CSV。')
  let rows: unknown
  try { rows = JSON.parse(text) } catch { throw invalid() }
  if (!rows || typeof rows !== 'object' || Array.isArray(rows)) throw invalid()
  const entries = Object.entries(rows)
  if (entries.length > 2500) throw new HttpError(413, '名單分片過大，請檢查選擇的 CSV。')
  await Promise.all(entries.map(async ([host, row]) => {
    if (host.length > 253 || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)
      || !Array.isArray(row) || row.length !== 3 || !['s', 'i', 'si', 'is'].includes(row[0])
      || typeof row[1] !== 'string' || row[1].length > 16 || typeof row[2] !== 'string' || row[2].length > 256
      || (await sha256(host))[0] !== parseInt(key, 16)) throw invalid()
  }))
  await env.TW165.put(uploadedShardKey(version, key), text, { metadata: { count: entries.length } })
  return { saved: true, retired: manifest.retired }
}

export async function publishTw165Upload(env: Env, version: string, count: number, sources: Tw165Meta['sources']) {
  const prefix = shardPrefix(version)
  const list = await env.TW165.list<{ count: number }>({ prefix, limit: 257 })
  if (list.keys.length < 256) return { pending: true }
  const complete = list.list_complete && list.keys.length === 256 && list.keys.every((k, i) =>
    k.name === prefix + i.toString(16).padStart(2, '0') && Number.isInteger(k.metadata?.count))
  if (!complete || list.keys.reduce((n, k) => n + (k.metadata?.count ?? 0), 0) !== count)
    throw new HttpError(422, '名單筆數與已上傳分片不符，請重新選擇檔案。')

  const time = nowIso()
  const meta = { available: true, updated_at: time, version, count, sources }
  const res = await env.DB.prepare(`INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    WHERE json_extract(app_settings.value, '$.version') < ?`)
    .bind(ACTIVE, JSON.stringify(meta), time, version).run()
  if (!res.meta.changes && (await activeTw165Upload(env.DB))?.version !== version)
    throw new HttpError(409, '已有另一份較新的名單發布，請重新整理查看。')
  return { published: true, changed: Boolean(res.meta.changes) }
}
