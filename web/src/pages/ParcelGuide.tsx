import { Link } from 'react-router-dom'
import { ParcelGuideContent } from '../components/PublicGuideContent'
import { useLanguage, tc } from '../language'
import './home.css'

export default function ParcelGuide() {
  const { t } = useLanguage()
  return (
    <article className="card home-example parcel-guide">
      <Link to="/" className="guide-back">{tc('ParcelGuide', '回首頁')}</Link>

      <ParcelGuideContent t={t} />
      <Link to="/check" className="btn-primary guide-check">{t('查核自己的訊息')}</Link>
    </article>
  )
}
