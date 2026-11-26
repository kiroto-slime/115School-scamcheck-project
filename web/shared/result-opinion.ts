export const opinionTopics = {
  helpful: ['有幫助', 'Helpful', '役に立った', '도움이 됨'],
  unhelpful: ['沒幫助', 'Not helpful', '役に立たなかった', '도움이 안 됨'],
  level: ['風險等級', 'Risk level', 'リスクの程度', '위험 수준'],
  reasons: ['判斷原因', 'Reasons', '判定理由', '판단 근거'],
  advice: ['處理建議', 'Suggested actions', '対応方法', '대응 방법'],
  controls: ['頁面操作', 'Using the page', 'ページの操作', '페이지 사용 방법'],
  other: ['其他', 'Other', 'その他', '기타'],
} as const
export type OpinionTopic = keyof typeof opinionTopics
export interface OpinionPeriod { deadline: string; keepUntil: string; open: boolean }
