import { useLanguage } from '../language'
/** 查核頁的外部服務選項：每個選項一行短字，詳細說明收在「查看更多」裡，用簡單圖示代替長文字 */
import type { ReactNode } from 'react'

export interface ServiceOption {
  key: string
  label: string
  /** 送出的資料類型：顯示成小標籤 */
  sends: ('文字' | '網址' | '網域' | '圖片影片')[]
  to: string
  checked: boolean
  onChange: (v: boolean) => void
  /** 暫時不能用（例如 AI 冷卻中）：變灰、不能勾 */
  disabled?: boolean
  /** 標籤旁的小提示（例如目前模型與剩餘次數） */
  chip?: ReactNode
  /** 展開說明裡的補充（例如模型順序） */
  detail?: ReactNode
}

const ICON: Record<string, ReactNode> = {
  文字: <path d="M4 6h16M4 12h10M4 18h13" />,
  網址: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  網域: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" /></>,
  圖片影片: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m4 16 5-5 4 4 2-2 5 5" /></>,
}

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON[name]}
    </svg>
  )
}

function SendTags({ sends }: { sends: ServiceOption['sends'] }) {
  const { t } = useLanguage()
  const names: Record<ServiceOption['sends'][number], string> = {
    文字: t('文字', 'Text', 'テキスト', '텍스트'),
    網址: t('網址', 'URL', 'URL', 'URL'),
    網域: t('網域', 'Domain', 'ドメイン', '도메인'),
    圖片影片: t('圖片影片', 'Images/videos', '画像・動画', '이미지·동영상'),
  }
  return (
    <span className="service-tags">
      {sends.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600"><Icon name={s} />{names[s]}</span>
      ))}
    </span>
  )
}

/** 流程示意：你的內容 → 遮蔽個資 → 勾選的服務 */
function FlowDiagram() {
  const { t } = useLanguage()
  const box = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs text-slate-700'
  const arrow = <svg viewBox="0 0 24 12" className="h-3 w-6 shrink-0 text-slate-400" aria-hidden="true"><path d="M1 6h20m-5-4 5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
  return (
    <div className="flex items-center justify-between gap-1" role="img" aria-label={t('你的內容先在本網站遮蔽個資，再送到你勾選的服務', 'This site masks personal details in text before sending it to the services you select.', 'このサイトでテキスト内の個人情報を伏せてから、選択したサービスに送信します。', '이 사이트에서 텍스트의 개인정보를 가린 뒤 선택한 서비스에 보냅니다.')}>
      <div className={box}>{t('你的內容', 'Your content', '入力内容', '입력 내용')}</div>{arrow}
      <div className={box}>{t('遮蔽手機、身分證、Email', 'Mask phone numbers, ID numbers and email addresses', '電話番号・身分証番号・メールアドレスを伏せる', '전화번호·신분증 번호·이메일 가리기')}</div>{arrow}
      <div className={box}>{t('只送到', 'Send only to', '送信先は', '전송 대상은')}<br />{t('打勾的服務', 'selected services', '選択したサービスのみ', '선택한 서비스만')}</div>
    </div>
  )
}

/** 「全選」：只管下面這些查詢服務（不包含研究同意 B、C，那些必須個別自願勾選） */
function SelectAll({ options }: { options: ServiceOption[] }) {
  const { t } = useLanguage()
  const usable = options.filter((o) => !o.disabled)
  const checkedCount = usable.filter((o) => o.checked).length
  const all = usable.length > 0 && checkedCount === usable.length
  return (
    <label className="flex min-h-11 items-center gap-3 border-b border-slate-200 pb-1">
      {/* 全部都勾了才打勾；部分勾選時維持空白，按一下就全部勾起來 */}
      <input type="checkbox" className="h-5 w-5 shrink-0" disabled={!usable.length} checked={all}
        onChange={() => usable.forEach((o) => o.onChange(!all))} />
      <span className="text-sm font-medium">{t('全選', 'Select all', 'すべて選択', '모두 선택')}</span>
    </label>
  )
}

export function ServiceOptions({ options }: { options: ServiceOption[] }) {
  const { t } = useLanguage()
  const descriptions: Record<string, string> = {
    cofacts: t('比對公開查核資料', 'Compare with public fact-checks', '公開の検証記事と照合', '공개 팩트체크 자료와 대조'), ai: t('協助解釋內容中的風險', 'Explain risks in the content', '内容に含まれるリスクを解説', '내용에 담긴 위험 설명'), google: t('查詢網址安全及公開查核文章', 'Check links and search public fact-checks', 'URLの安全性と公開の検証記事を検索', 'URL 안전성 검사 및 공개 팩트체크 검색'), vt: t('查詢網域已有的安全報告', 'Look up existing domain reports', 'ドメインの既存の安全性レポートを検索', '도메인의 기존 보안 보고서 조회'),
  }
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">{t('要一起查詢的服務', 'Services to include', '利用するサービス', '함께 조회할 서비스')}</p>
      {options.length > 1 && <SelectAll options={options} />}
      <div className="service-row text-sm text-slate-700">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-teal-700" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5 9-10" /></svg>
        </span>
        <span className="min-w-0 flex-1">{t('規則分析、165 涉詐網站名單', 'Rule checks and Taiwan’s 165 fraud site list', 'ルール分析と台湾の165詐欺サイトリスト', '규칙 분석 및 대만 165 사기 사이트 목록')}<span className="block text-xs text-slate-500">{t('基本檢查，一定執行，不送出', 'Always checked on this site. No external requests.', '常にサイト内で実行。外部送信はありません。', '항상 사이트 안에서 검사하며 외부로 전송하지 않습니다.')}</span></span>
        <span className="text-xs text-slate-500">{t('基本', 'Basic', '基本', '기본')}</span>
      </div>
      {options.map((o) => (
        <div key={o.key} className={`service-row ${o.key === 'ai' ? 'ai-service-row' : ''}`} data-service={o.key}>
          <label className="service-main">
            <input type="checkbox" className="h-5 w-5 shrink-0" disabled={o.disabled} checked={o.checked && !o.disabled} onChange={(e) => o.onChange(e.target.checked)} />
            <span className="min-w-0 text-sm">
              <span>{o.label}</span>
              <span className="block text-xs text-slate-500">{descriptions[o.key]}</span>
            </span>
          </label>
          {o.chip && <div className="service-chip">{o.chip}</div>}
          <SendTags sends={o.sends} />
        </div>
      ))}
      <details className="rounded-xl bg-slate-50 p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-teal-800">{t('查看更多：這些服務會收到什麼？', 'What do these services receive?', '各サービスに何が送信されますか？', '각 서비스에는 무엇을 보내나요?')}</summary>
        <div className="mt-2 space-y-3">
          <FlowDiagram />
          <ul className="space-y-2 text-sm">
            {options.map((o) => (
              <li key={o.key} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{o.label}</span><span className="text-slate-500">→ {o.to}</span><SendTags sends={o.sends} />
                {o.detail && <div className="w-full">{o.detail}</div>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">{t('不勾選就不會送出。外部服務的結果可能誤判或漏判，查無資料不代表安全。圖片、影片只有勾選 Gemini 才會原樣送到 Google。', 'Only selected services receive data. They may flag harmless content or miss a threat. No match does not mean safe. Original images and videos go to Google only if you select Gemini.', '選択したサービスにのみ送信します。外部サービスには誤検出や見落としがあり、該当なしでも安全とは限りません。画像・動画はGeminiを選択した場合のみ、そのままGoogleに送信されます。', '선택한 서비스에만 데이터를 보냅니다. 외부 서비스는 잘못 판단하거나 위험을 놓칠 수 있어 검색 결과가 없어도 안전하다는 뜻은 아닙니다. Gemini를 선택한 경우에만 원본 이미지와 동영상을 Google에 보냅니다.')}</p>
        </div>
      </details>
    </div>
  )
}
