/**
 * 可解釋的規則式風險分析器（由 v0.1 Python 版 risk_analyzer.py 逐條移植）。
 *
 * - 風險指數 0-100 只是「規則加權分數」，不是經統計校準的詐騙機率。
 * - 分析結果不是司法認定或正式詐騙判決。
 * - 未偵測到特徵時回報「資訊不足」，而不是「安全」。
 * 修改規則時請同步更新 RULE_VERSION 與 worker/test/rules.test.ts。
 */

export const RULE_VERSION = 'rules-2026.10-v0.2'
export type RiskLevel = '低' | '中' | '高' | '資訊不足'
const MIN_TEXT_CHARS = 12

interface Rule {
  feature_id: string
  label: string
  description: string
  weight: number
  keywords: string[]
  patterns: RegExp[]
  human_verified: boolean
}

const rule = (feature_id: string, label: string, description: string, weight: number, keywords: string[], patterns: RegExp[] = []): Rule =>
  ({ feature_id, label, description, weight, keywords, patterns, human_verified: false })

export const RULES: Rule[] = [
  rule('urgency', '急迫時間壓力', '以時間限制或倒數逼迫你立即行動，降低思考時間。', 15,
    ['立即', '立刻', '馬上', '儘快', '盡快', '限時', '今天內', '24小時內', '最後一天', '逾期', '倒數', '名額有限', '即將失效', '即將停用', '最後機會'],
    [/\d+\s*(分鐘|小時)內/]),
  rule('authority', '冒充官方或權威機構', '自稱政府、警察、銀行、電商或物流等機構，藉權威取得信任。', 15,
    ['警察', '警局', '檢察官', '地檢署', '法院', '刑事局', '165', '國稅局', '健保署', '監理站', '銀行客服', '官方客服', '郵局', '中華郵政', '海關', '金管會']),
  rule('financial_request', '要求付款或匯款', '要求匯款、轉帳、儲值、購買點數或先付費用。', 25,
    ['匯款', '轉帳', 'ATM', 'atm', '解除分期', '儲值', '點數卡', '遊戲點數', '保證金', '手續費', '解凍金', '代墊', '先付', '訂金', '加值', 'USDT', '虛擬貨幣', '比特幣', '面交']),
  rule('personal_data', '要求提供個人資料', '要求身分證、住址、生日、存摺等個人資料。', 15,
    ['身分證', '身份證', '健保卡', '存摺', '生日', '住址', '地址', '證件照', '自拍照', '手持證件', '個資']),
  rule('credential_request', '要求帳號或驗證碼', '要求提供密碼、OTP 驗證碼、網銀帳密或登入資訊。', 25,
    ['驗證碼', '簡訊碼', 'OTP', 'otp', '密碼', '帳號密碼', '網銀', '登入連結', '認證碼', '提款卡']),
  rule('suspicious_link', '可疑網址或導流', '包含縮網址、IP 網址、非常見網域或要求加入私人 LINE / Telegram。', 20,
    ['加LINE', '加 LINE', '加賴', '私訊我', 'Telegram', 'telegram', '點擊連結', '點選連結', '掃描QR', '掃QR']),
  rule('guaranteed_reward', '保證獲利或獎勵', '宣稱穩賺不賠、高報酬、中獎或免費贈品。', 20,
    ['保證獲利', '穩賺', '穩賺不賠', '零風險', '高報酬', '日賺', '月入', '躺著賺', '中獎', '恭喜您', '免費領', '抽中', '飆股', '帶單', '老師帶', '內線', '翻倍'],
    [/(報酬|獲利|收益)\s*\d+\s*%/]),
  rule('emotional_pressure', '恐懼、威脅或情感操控', '以威脅、恐嚇、羞辱或情感依附施壓。', 15,
    ['凍結', '停權', '通緝', '逮捕', '涉嫌', '洗錢', '法律責任', '提告', '不要告訴', '別告訴', '保密', '出事', '很急', '救我', '被扣款']),
  rule('impersonation', '假冒特定身分', '自稱親友、網紅、客服或熟人換了新帳號。', 15,
    ['我換手機', '我換號碼', '猜猜我是誰', '新的LINE', '新帳號', '我是客服', '專員', '我是你', '老同學']),
  rule('other', '其他可疑特徵', '例如出租帳戶、代收包裹、高薪輕鬆打工等常見詐騙或人頭帳戶話術。', 10,
    ['出租帳戶', '租借帳戶', '提供帳戶', '借帳戶', '代收包裹', '代領包裹', '高薪', '輕鬆賺', '免經驗', '家庭代工', '日領', '跑腿費']),
]

// 與 Python 版樣式字串一致（顯示在「觸發依據」中）
const PATTERN_TEXT: Record<string, string> = {
  urgency: '\\d+\\s*(分鐘|小時)內',
  guaranteed_reward: '(報酬|獲利|收益)\\s*\\d+\\s*%',
}

const URL_RE = /(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi
const BARE_DOMAIN_RE = /(?<![a-z0-9-])[a-z0-9-]+\.(?:top|xyz|icu|cc|vip|shop|club|live|site|online|buzz|tk)(?![a-z0-9])/i
const SHORTENERS = new Set(['bit.ly', 'reurl.cc', 'tinyurl.com', 'lihi.cc', 'lihi1.com', 'lihi2.cc', 'pse.is', 'ppt.cc', 't.ly', 'is.gd', 'cutt.ly', 'goo.gl'])
const RISKY_TLDS = new Set(['top', 'xyz', 'icu', 'cc', 'vip', 'shop', 'club', 'live', 'site', 'online', 'buzz', 'tk'])
const CHAT_REDIRECT = ['line.me', 'lin.ee', 't.me']
const COMBOS: [string[], number][] = [
  [['urgency', 'financial_request'], 10],
  [['authority', 'credential_request'], 10],
  [['authority', 'emotional_pressure'], 10],
  [['guaranteed_reward', 'suspicious_link'], 10],
]

const SAFE_ACTIONS: Record<string, string> = {
  financial_request: '不要依對方指示匯款、轉帳或購買點數；先暫停並與家人或師長討論。',
  credential_request: '任何人索取驗證碼、密碼都不要提供；正規機構不會用訊息要你提供。',
  personal_data: '不要提供身分證、存摺或證件照片給不明對象。',
  suspicious_link: '不要點擊訊息中的連結；改用官方 App 或自行輸入官方網址查詢。',
  authority: '掛斷或停止回覆，自行查官方電話回撥確認，或撥打 165 反詐騙專線。',
  urgency: '越被催促越要停下來，給自己時間查證。',
  guaranteed_reward: '保證獲利、高報酬幾乎都是詐騙常見話術，不要加入不明投資群組。',
  emotional_pressure: '遇到威脅或要求保密時，先告訴信任的大人。',
  impersonation: '親友說換了新帳號時，先用原本的電話或當面確認身分。',
  other: '不要出租、出借帳戶或代收包裹，這可能讓你成為詐騙集團的人頭而觸法。',
}
const GENERAL_ACTION = '如仍有疑慮，可撥打 165 反詐騙諮詢專線或向家人、老師確認。'

export interface Feature {
  feature_id: string
  label: string
  description: string
  triggers: string[]
  rule_version: string
  human_verified: boolean
}

export interface RiskResult {
  risk_level: RiskLevel
  risk_score: number | null
  features: Feature[]
  basis: string[]
  safe_actions: string[]
  rule_version: string
  tags: string[]
}

export interface SourceSignal {
  reply_type: string | null
  match_type: string
}

/** 網址安全檢查的結果（165 名單、Google 安全瀏覽、VirusTotal） */
export interface UrlSignals {
  tw165Listed: number
  safeBrowsingThreats: number
  virusTotalMalicious: number
}
const NO_URL_SIGNALS: UrlSignals = { tw165Listed: 0, safeBrowsingThreats: 0, virusTotalMalicious: 0 }
const LISTED_URL_ACTION = '不要開啟訊息中的網址、不要輸入任何資料；有疑問可撥 165 反詐騙諮詢專線查證。'

/** 全形轉半形、去除多餘空白，降低規避字元的影響 */
export function normalize(text: string): string {
  return (text || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

/** 只分析網址字串本身，絕不連線或開啟網址。觸發依據只記網域類型，不記完整網址。 */
function urlTriggers(text: string): string[] {
  const triggers: string[] = []
  for (const raw of text.match(URL_RE) ?? []) {
    let host = ''
    try {
      host = new URL(raw.includes('://') ? raw : 'http://' + raw).hostname.toLowerCase()
    } catch {
      continue
    }
    if (!host) continue
    const tld = host.split('.').pop() ?? ''
    if (SHORTENERS.has(host)) triggers.push(`縮網址（${host}）`)
    else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) triggers.push('以 IP 位址組成的網址')
    else if (host.startsWith('xn--') || host.includes('.xn--')) triggers.push('國際化（punycode）網域')
    else if (RISKY_TLDS.has(tld)) triggers.push(`較常被濫用的網域結尾（.${tld}）`)
    else if (CHAT_REDIRECT.some((d) => host === d || host.endsWith('.' + d))) triggers.push('導流至私人通訊軟體')
    else triggers.push('包含外部網址（未自動開啟）')
  }
  if (!triggers.length && BARE_DOMAIN_RE.test(text)) triggers.push('疑似網址（非常見網域結尾）')
  return triggers
}

/** 與 Python sorted() 相同：依 Unicode 碼位排序 */
const byCodePoint = (a: string, b: string) => {
  const x = [...a], y = [...b]
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!
    if (d) return d
  }
  return x.length - y.length
}

export function analyzeText(text: string, sourceSignals: SourceSignal[] = [], urlSignals: UrlSignals = NO_URL_SIGNALS): RiskResult {
  const clean = normalize(text)
  const features: Feature[] = []
  for (const r of RULES) {
    let hits = r.keywords.filter((k) => clean.includes(k))
    if (r.patterns.some((p) => p.test(clean))) hits.push(`符合樣式：${PATTERN_TEXT[r.feature_id]}`)
    if (r.feature_id === 'suspicious_link') hits = hits.concat(urlTriggers(clean))
    if (hits.length) {
      features.push({
        feature_id: r.feature_id, label: r.label, description: r.description,
        triggers: [...new Set(hits)].sort(byCodePoint).slice(0, 6), rule_version: RULE_VERSION, human_verified: r.human_verified,
      })
    }
  }

  const basis: string[] = []
  let score = 0
  const found = new Set(features.map((f) => f.feature_id))
  for (const f of features) {
    const r = RULES.find((x) => x.feature_id === f.feature_id)!
    score += r.weight + Math.min(f.triggers.length - 1, 2) * 3
    basis.push(`偵測到「${f.label}」：${f.triggers.join('、')}`)
  }
  for (const [combo, extra] of COMBOS) {
    if (combo.every((c) => found.has(c))) {
      score += extra
      basis.push('多種高風險特徵同時出現（組合加權）')
    }
  }
  // 來源訊號：Cofacts 已查核為不實的相同／相似內容才加分；查無資料不代表安全
  for (const sig of sourceSignals) {
    if (sig.reply_type === 'RUMOR') {
      const exact = sig.match_type === 'exact'
      score += exact ? 25 : 10
      basis.push(`Cofacts 有${exact ? '相同' : '相似'}訊息被查核為含有不實訊息（相似不等於同一事件）`)
    }
  }
  // 網址訊號：官方名單與資安服務的判定，加分較重
  let urlBoost = 0
  if (urlSignals.tw165Listed > 0) {
    urlBoost += 40
    basis.push('網址列在警政署 165 涉詐網站名單中')
  }
  if (urlSignals.safeBrowsingThreats > 0) {
    urlBoost += 30
    basis.push('Google 安全瀏覽將網址標示為疑似不安全')
  }
  // 只有 1 個引擎判定惡意常是誤判，2 個以上才加分
  if (urlSignals.virusTotalMalicious >= 2) {
    urlBoost += 20
    basis.push(`VirusTotal 有 ${urlSignals.virusTotalMalicious} 個資安引擎判定網域惡意`)
  }
  score = Math.min(score + urlBoost, 100)

  let level: RiskLevel
  let scoreOut: number | null
  if ([...clean].length < MIN_TEXT_CHARS && !features.length && !urlBoost) {
    level = '資訊不足'
    scoreOut = null
    basis.push('內容過短，無法判斷。')
  } else if (!features.length && score === 0) {
    level = '資訊不足'
    scoreOut = 0
    basis.push('未偵測到規則庫中的已知風險特徵，但這不代表訊息安全。')
  } else {
    scoreOut = score
    level = score >= 60 ? '高' : score >= 30 ? '中' : '低'
  }

  const actions = features.filter((f) => SAFE_ACTIONS[f.feature_id]).map((f) => SAFE_ACTIONS[f.feature_id])
  if (urlBoost) actions.unshift(LISTED_URL_ACTION)
  actions.push(GENERAL_ACTION)
  return { risk_level: level, risk_score: scoreOut, features, basis, safe_actions: actions, rule_version: RULE_VERSION, tags: features.map((f) => f.feature_id) }
}

/** 送往第三方前，先遮蔽常見個資（身分證、手機、Email、長數字帳號） */
export function redactPii(text: string): string {
  return text
    .replace(/(?<![A-Za-z0-9])[A-Z][12]\d{8}(?!\d)/g, '[身分證]')
    .replace(/(?<!\d)09\d{2}[- ]?\d{3}[- ]?\d{3}(?!\d)/g, '[手機]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/g, '[Email]')
    .replace(/(?<!\d)\d{10,16}(?!\d)/g, '[數字帳號]')
}
