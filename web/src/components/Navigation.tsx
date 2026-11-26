import { useRef, type PointerEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { useLanguage } from '../language'
import { LanguageMenu } from './LanguageMenu'

const GROUPS = [
  { title: '日常查核', links: [
    ['/check', '防詐查核', 'M21 21l-5-5M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15'],
    ['/history', '查核紀錄', 'M3 5v5h5M3 10a9 9 0 1 1 2 8M12 7v5l3 2'],
  ] },
  { title: '參與研究', links: [
    ['/research', '研究測驗', 'M12 5v15M12 5C8 2 4 3 2 4v15c3-2 7-2 10 1 3-3 7-3 10-1V4c-3-1-7-2-10 1'],
    ['/products', '產品與需求', 'M21 11a8 8 0 0 1-8 8H4l-3 3 2-7a8 8 0 1 1 18-4M7 9h10M7 13h6'],
  ] },
  { title: '關於網站', links: [
    ['/chat', '對話', 'M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.8L3 21l1.3-4.5A9 9 0 1 1 21 11zM8 9h8M8 13h5'],
    ['/privacy', '隱私與說明', 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3'],
    ['/game', '小遊戲', 'M7 7h10a5 5 0 0 1 5 5v5a3 3 0 0 1-5 2l-2-2H9l-2 2a3 3 0 0 1-5-2v-5a5 5 0 0 1 5-5zM7 10v6M4 13h6M16 11h.01M19 14h.01'],
  ] },
] as const

export function Navigation({ mobile = false, open = false, ballEnabled, onToggleBall }: {
  mobile?: boolean; open?: boolean; ballEnabled: boolean; onToggleBall: () => void
}) {
  const nav = useRef<HTMLElement>(null)
  const { t } = useLanguage()
  const labels: Record<string, string> = {
    日常查核: t('日常查核', 'Everyday checks', '日常の確認', '일상 확인'),
    參與研究: t('參與研究', 'Take part', '研究に参加', '연구 참여'),
    關於網站: t('關於網站', 'About this site', 'このサイトについて', '사이트 안내'),
    防詐查核: t('防詐查核', 'Scam check', '詐欺チェック', '사기 확인'),
    查核紀錄: t('查核紀錄', 'Check history', '確認履歴', '확인 기록'),
    研究測驗: t('研究測驗', 'Research quiz', '研究テスト', '연구 퀴즈'),
    產品與需求: t('產品與需求', 'Share feedback', 'ご意見・ご要望', '의견 보내기'),
    對話: t('對話', 'Chat', 'チャット', '대화'),
    隱私與說明: t('隱私與說明', 'Privacy & help', 'プライバシー・説明', '개인정보 및 도움말'),
    小遊戲: t('小遊戲', 'Mini game', 'ミニゲーム', '미니 게임'),
  }
  const reset = () => nav.current?.querySelectorAll<HTMLElement>('.nav-item').forEach((item) => item.style.removeProperty('--nav-shift'))
  const followPointer = (event: PointerEvent<HTMLElement>) => {
    if (mobile || !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return
    nav.current?.querySelectorAll<HTMLElement>('.nav-item').forEach((item) => {
      const rect = item.getBoundingClientRect()
      const influence = Math.max(0, 1 - Math.abs(event.clientY - rect.top - rect.height / 2) / 180)
      item.style.setProperty('--nav-shift', `${36 * influence * influence}px`)
    })
  }
  return (
    <nav ref={nav} id={mobile ? 'main-nav' : undefined} aria-label={t('主選單','Main menu','メインメニュー','주 메뉴')}
      className={mobile ? `mobile-nav ${open ? 'is-open' : ''}` : 'desktop-nav'}
      onPointerMove={followPointer} onPointerLeave={reset}>
      {GROUPS.map((group) => (
        <div className="nav-group" key={group.title}>
          <p className="nav-heading">{labels[group.title]}</p>
          {group.links.map(([to, label, path]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
              <span>{labels[label]}</span>
            </NavLink>
          ))}
        </div>
      ))}
      <LanguageMenu />
      <button className="chat-switch" role="switch" aria-checked={ballEnabled} onClick={onToggleBall}>
        {t('顯示客服小球','Show help bubble','ヘルプボタンを表示','도움말 버튼 표시')}<span aria-hidden="true" />
      </button>
    </nav>
  )
}
