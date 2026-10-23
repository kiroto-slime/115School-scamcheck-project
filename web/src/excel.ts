/** 在瀏覽器產生研究資料 Excel（exceljs）。後端只提供不含原文、個資的表格資料。 */

export interface Sheet {
  name: string
  headers: string[]
  dateColumns: number[]
  rows: (string | number | boolean | null)[][]
}

export interface ExportData {
  sheets: Sheet[]
  exported_at: string
  label: string
}

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r', '\n']
const DATE_FMT = 'yyyy-mm-dd hh:mm:ss'

/** 防止 Excel / CSV 公式注入：以這些字元開頭的文字前面加上單引號 */
export function safeCell(v: string | number | boolean | null): string | number | boolean | null {
  if (typeof v !== 'string') return v
  const clean = v.replace(/\0/g, '')
  return FORMULA_PREFIXES.some((p) => clean.startsWith(p)) ? "'" + clean : clean
}

const toDate = (v: unknown) => {
  if (typeof v !== 'string') return v
  const d = new Date(v)
  return isNaN(d.getTime()) ? v : d
}

export async function buildWorkbook(data: ExportData): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.created = new Date(data.exported_at)
  for (const sheet of data.sheets) {
    const ws = wb.addWorksheet(sheet.name)
    ws.properties.defaultRowHeight = 20
    const header = ws.addRow(sheet.headers)
    header.eachCell((c) => {
      c.font = { name: '微軟正黑體', size: 11, bold: true }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }
    })
    for (const row of sheet.rows) {
      const dataRow = ws.addRow(row.map((v, i) => (sheet.dateColumns.includes(i) && v ? toDate(v) : safeCell(v))))
      dataRow.font = { name: '微軟正黑體', size: 11 }
      dataRow.alignment = { vertical: 'top', wrapText: true }
    }
    for (const i of sheet.dateColumns) ws.getColumn(i + 1).numFmt = DATE_FMT
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.headers.length } }
    sheet.headers.forEach((h, i) => {
      let longest = h.length * 2
      for (const row of sheet.rows) longest = Math.max(longest, Math.min(String(row[i] ?? '').length * 1.6, 60))
      const summaryWidths = [42, 28, 48, 48, 42, 36, 24, 34, 16, 42, 48]
      ws.getColumn(i + 1).width = sheet.name === '查核摘要' ? summaryWidths[i] ?? 30 : Math.max(12, Math.min(longest + 2, 60))
    })
  }
  wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }]
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

export function downloadBlob(buf: ArrayBuffer | Blob, filename: string, type: string) {
  const url = URL.createObjectURL(buf instanceof Blob ? buf : new Blob([buf], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
