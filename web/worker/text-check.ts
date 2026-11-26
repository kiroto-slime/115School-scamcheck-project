import { DurableObject } from 'cloudflare:workers'
import { runAnalysis, type AnalyzeInput } from './analysis'
import { getSettings } from './settings'

/** 一筆文字查核用一個獨立的鬧鐘執行。原文只放在記憶體，重啟時回報中斷。 */
export class TextCheck extends DurableObject<Env> {
  private input?: AnalyzeInput

  async accept(id: string, input: AnalyzeInput) {
    this.input = input
    await this.ctx.storage.put('id', id)
    await this.ctx.storage.setAlarm(Date.now())
  }

  async alarm() {
    const id = await this.ctx.storage.get<string>('id')
    if (!id) return
    const input = this.input
    this.input = undefined
    const db = this.env.DB
    try {
      if (!(await db.prepare('SELECT 1 FROM analysis_records WHERE analysis_id = ?').bind(id).first())) {
        if (!input) throw new Error('查核已中斷')
        await runAnalysis(this.env, await getSettings(db), input, id)
      }
      await db.prepare('DELETE FROM text_jobs WHERE id = ?').bind(id).run()
    } catch {
      await db.prepare('UPDATE text_jobs SET failed = 1 WHERE id = ?').bind(id).run()
    }
    await this.ctx.storage.deleteAll()
  }
}
