export const opinionTopics = {
  helpful: '有幫助',
  unhelpful: '沒幫助',
  level: '風險等級',
  reasons: '判斷原因',
  advice: '處理建議',
  controls: '頁面操作',
  other: '其他',
} as const
export type OpinionTopic = keyof typeof opinionTopics
export interface OpinionPeriod { deadline: string; keepUntil: string; open: boolean }
