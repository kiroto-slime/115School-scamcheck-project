/**
 * 產生配色主題 src/accents.css：以目前「青綠」主題的實際顏色為基礎，只旋轉色相（亮度、彩度不變），
 * 所以每個主題的文字對比與可讀性都和預設一致，並同時產生淺色與深色兩版。
 * 改了 index.css 的青綠色票後，執行：node scripts/gen-accents.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** 主題代號 → OKLCH 色相 */
export const ACCENTS = { blue: 250, violet: 295, orange: 50, pink: 355 }
const ROTATE = /^--(color-(slate|teal)-\d+|color-white|surface|field|topbar|menu-glass|control-border|placeholder|glow-green|glow-blue|panel-shadow)$/

// ---- 讀取目前的實際色票：Tailwind 預設 → :root → :root.dark（依檔案順序覆蓋） ----
const vars = (block) => Object.fromEntries([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const theme = readFileSync(join(ROOT, 'node_modules/tailwindcss/theme.css'), 'utf8')
const defaults = Object.fromEntries(Object.entries(vars(theme)).filter(([k]) => ROTATE.test(k)))
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')
const blocks = [...css.matchAll(/^(:root(?:\.dark)?)\s*\{([^}]*)\}/gm)].map((m) => ({ dark: m[1] === ':root.dark', v: vars(m[2]) }))
const light = { ...defaults }
for (const b of blocks) if (!b.dark) Object.assign(light, b.v)
const dark = { ...light }
for (const b of blocks) if (b.dark) Object.assign(dark, b.v)

// ---- 顏色換算（sRGB ↔ OKLCH） ----
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function rgbToOklch(r, g, b) {
  ;[r, g, b] = [r, g, b].map((x) => lin(x / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360]
}
/** 把一個顏色字串轉成 [L, C, H, alpha] */
function parse(token) {
  let m = /^#([0-9a-f]{6})$/i.exec(token)
  if (m) return [...rgbToOklch(...[0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))), 1]
  m = /^rgba?\(([^)]+)\)$/.exec(token)
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [...rgbToOklch(p[0], p[1], p[2]), p[3] ?? 1] }
  m = /^oklch\(([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\)$/.exec(token)
  if (m) { const L = Number(m[1]); return [L > 1 ? L / 100 : L, Number(m[2]), Number(m[3]), 1] }
  return null
}
const TEAL_HUE = parse(light['--color-teal-700'])[2]
const fmt = ([L, C, H, a]) => `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)}${a < 1 ? ` / ${+a.toFixed(3)}` : ''})`
/** 數值裡的每個顏色都旋轉色相；幾乎沒有彩度的灰色不轉 */
const rotate = (value, target) => value.replace(/#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)|oklch\([^)]*\)/g, (tok) => {
  const c = parse(tok)
  if (!c) return tok
  if (c[1] < 0.004) return tok
  return fmt([c[0], c[1], (c[2] - TEAL_HUE + target + 360) % 360, c[3]])
})

let out = '/* 由 scripts/gen-accents.mjs 自動產生，請勿手動修改。預設（青綠）不在這裡，維持 index.css 原樣。 */\n'
for (const [name, hue] of Object.entries(ACCENTS)) {
  for (const [sel, src] of [[`:root:not(.dark)[data-accent="${name}"]`, light], [`:root.dark[data-accent="${name}"]`, dark]]) {
    out += `${sel} {\n${Object.entries(src).filter(([k]) => ROTATE.test(k)).map(([k, v]) => `  ${k}: ${rotate(v, hue)};`).join('\n')}\n}\n`
  }
}
writeFileSync(join(ROOT, 'src/accents.css'), out)
console.log('已產生 src/accents.css', Object.keys(ACCENTS).join('、'), '基準色相', TEAL_HUE.toFixed(1))
