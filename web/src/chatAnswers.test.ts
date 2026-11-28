import { afterEach, describe, expect, it } from 'vitest'
import { answerQuestion, siteQuestion, siteReply } from './chatAnswers'
import { setActiveDictionary, translate } from './i18n/dictionary'

const tip = () => ({ text: 'tip', tip: true })
afterEach(() => setActiveDictionary({}))

describe('客服問答：網站怎麼用', () => {
  it.each([
    ['vi', 'Cách dùng trang web này?'],
    ['id', 'Bagaimana cara memakai situs ini?'],
    ['th', 'เว็บไซต์นี้ใช้อย่างไร'],
    ['zh-Hans', '这个网站怎么用？'],
  ])('%s：按下「網站怎麼用」起始按鈕會回網站使用說明，不是隨機提醒', (_, label) => {
    setActiveDictionary({ [siteQuestion]: label })
    expect(answerQuestion(translate(siteQuestion), 'support', tip)).toEqual({ text: siteReply })
  })
  it.each(['这个网站怎么用', 'trang web dùng sao', 'cara pakai situs', 'ใช้เว็บไซต์ยังไง'])('新語言自己打字問「%s」也會回網站使用說明', question => {
    expect(answerQuestion(question, 'support', tip)).toEqual({ text: siteReply })
  })
  it('驗證碼的簡體寫法也認得', () => {
    expect(answerQuestion('有人要我的验证码', 'support', tip).text).not.toBe('tip')
  })
})
