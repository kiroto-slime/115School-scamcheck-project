import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildWorkbook, safeCell, type ExportData } from './excel'

const data: ExportData = {
  exported_at: '2026-10-23T00:00:00Z',
  label: '模擬資料（DEMO）',
  sheets: [
    { name: 'Pattern_Dataset', headers: ['模式編號', '詐騙類型'], dateColumns: [], rows: [['p1', '=HYPERLINK("http://evil","x")'], ['p2', '+cmd'], ['p3', '正常']] },
    { name: 'Consent_Records', headers: ['研究編號', '同意時間'], dateColumns: [1], rows: [['RABC', '2026-10-23T01:02:03Z']] },
    { name: 'Summary', headers: ['指標', '數值'], dateColumns: [], rows: [['有效樣本數（完成前後測）', 0], ['建議', '停止匯款\n聯絡官方確認']] },
  ],
}

describe('Excel 匯出', () => {
  it('防公式注入', () => {
    expect(safeCell('=1+1')).toBe("'=1+1")
    expect(safeCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(safeCell('正常')).toBe('正常')
    expect(safeCell(3)).toBe(3)
  })

  it('產生可開啟的檔案：中文欄名、凍結標題、篩選、日期格式、沒有公式', async () => {
    const buf = await buildWorkbook(data)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Pattern_Dataset', 'Consent_Records', 'Summary'])
    const ws = wb.getWorksheet('Pattern_Dataset')!
    expect(ws.getCell('A1').value).toBe('模式編號')
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(ws.autoFilter).toBeTruthy()
    const values = [2, 3, 4].map((r) => ws.getCell(`B${r}`))
    expect(values.every((c) => c.type !== ExcelJS.ValueType.Formula)).toBe(true)
    expect(values[0].value).toBe('\'=HYPERLINK("http://evil","x")')
    const date = wb.getWorksheet('Consent_Records')!.getCell('B2')
    expect(date.value).toBeInstanceOf(Date)
    expect(date.numFmt).toBe('yyyy-mm-dd hh:mm:ss')
    expect(wb.getWorksheet('Summary')!.getCell('B3').alignment.wrapText).toBe(true)
    expect(wb.getWorksheet('Summary')!.getCell('B3').value).toBe('停止匯款\n聯絡官方確認')
    expect(wb.views[0].activeTab).toBe(0)
  })
})
