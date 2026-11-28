// SVG 文字不會自動換行或縮小；依字元估算寬度（單位：字級 em），太長就縮小字級。
const zeroWidth = /[̀-ͯัิ-ฺ็-๎]/
const wide = /[⺀-鿿가-힯＀-￯]/

/** 估算一行文字約佔幾個 em。 */
export function estimateEm(text: string): number {
  let em = 0
  for (const char of text.normalize('NFC')) {
    if (zeroWidth.test(char)) continue
    if (wide.test(char)) em += 1
    else if (char === ' ') em += 0.3
    else if (/[A-Z]/.test(char)) em += 0.65
    else em += 0.55
  }
  return em
}

/** 放得下就用原字級，放不下就縮小到剛好放得進 width。 */
export const fitFontSize = (text: string, base: number, width: number) =>
  Math.min(base, Math.floor(width / Math.max(estimateEm(text), 1)))
