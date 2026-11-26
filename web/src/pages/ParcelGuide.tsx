import { Link } from 'react-router-dom'
import { ParcelGuideContent } from '../components/PublicGuideContent'
import { useLanguage } from '../language'
import './home.css'

export default function ParcelGuide() {
  const { t } = useLanguage()
  return (
    <article className="card home-example parcel-guide">
      <Link to="/" className="guide-back">{t('回首頁', 'Back to home', 'ホームへ戻る', '홈으로 돌아가기')}</Link>

      <ParcelGuideContent t={t} />
      <Link to="/check" className="btn-primary guide-check">{t('查核自己的訊息', 'Check your own message', '自分のメッセージを確認する', '내 메시지 확인하기')}</Link>
    </article>
  )
}
