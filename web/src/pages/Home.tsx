import { Link } from 'react-router-dom'
import { useHealth } from '../components/ui'
import { useLanguage } from '../language'
import './home.css'

function HomeIcon({ kind }: { kind: 'check' | 'research' | 'parcel' | 'arrow' }) {
  const paths = {
    check: 'M21 21l-5.1-5.1M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15',
    research: 'M12 5v15M12 5C8 2 4 3 2 4v15c3-2 7-2 10 1 3-3 7-3 10-1V4c-3-1-7-2-10 1',
    parcel: 'm3 7 9-4 9 4v10l-9 5-9-5zM3 7l9 5 9-5M12 12v10M7.5 5l9 5',
    arrow: 'M4 12h15m-6-6 6 6-6 6',
  }
  return <svg className="home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}

function ParcelPhoto() {
  const { lang, t } = useLanguage()
  return (
    <div className="parcel-visual" role="img" aria-label={t(
      '窗邊的包裹旁，手機收到一則要求確認地址的通知。',
      'A phone next to a parcel by the window shows a notification asking to confirm an address.',
      '窓辺の荷物の横にあるスマートフォンに、住所確認を求める通知が届いています。',
      '창가의 택배 상자 옆 휴대전화에 주소 확인을 요청하는 알림이 떠 있습니다.',
    )}>
      <div className="parcel-photo">
        {/* 通知文字使用與底圖相同的座標系統，縮放和切換語言時仍貼合手機螢幕。 */}
        <svg aria-hidden="true" className="parcel-screen" viewBox="0 0 1536 1024">
          <g transform="matrix(1 .085 -.13 1 1141 385)">
            <rect className="parcel-screen-card" width="261" height="191" rx="27" />
            <path className="parcel-screen-card" d="m19 176-6 26 32-16z" />
            <rect x="17" y="31" width="53" height="52" rx="13" fill="#8bb99d" />
            <path fill="white" d="M60 55c0 8-7 14-17 14h-4l-7 4 2-7c-5-2-8-6-8-11 0-8 7-13 17-13s17 5 17 13z" />
            <g fill="#8bb99d"><circle cx="35" cy="55" r="2" /><circle cx="43" cy="55" r="2" /><circle cx="51" cy="55" r="2" /></g>
            <text x="80" y="68" fontWeight="650" fontSize={lang === 'en' ? 25 : 31}>{t('包裹通知', 'Parcel update', '配送通知', '배송 알림')}</text>
            <path className="parcel-screen-line" d="M22 99h216" />
            <text x="130" y="148" textAnchor="middle" fontWeight="550" fontSize={lang === 'en' ? 25 : 30}>{t('地址需要確認', 'Confirm address', '住所の確認', '주소 확인 요청')}</text>
          </g>
        </svg>
      </div>
    </div>
  )
}

export default function Home() {
  const { t } = useLanguage()
  const { health } = useHealth()
  const limits = health?.limits
  const textLimit = limits?.max_text_chars ?? 10000
  const imageMB = limits?.max_image_mb ?? 10
  const videoMB = limits?.max_video_mb ?? 20
  const seconds = limits?.max_video_seconds ?? 30
  const gemini = health?.modes.ai === 'gemini'

  return (
    <div className="home-page">
      <section className="home-hero">
        <ParcelPhoto />
        <div className="home-intro">
          <h1>{t('識詐數據庫', 'ScamCheck', '詐欺チェック', '사기 확인')}</h1>
          <p className="home-lead">{t('收到「包裹地址有誤」的簡訊？', 'A text says your parcel is on hold?', '「住所不備」のSMSが届いたら？', '“배송 주소를 확인해 주세요”라는 문자를 받으셨나요?')}</p>
          <p className="home-description">{t('點連結前，先查一查。貼上可疑訊息、截圖或短片，看看有哪些地方值得留意。', 'Before opening the link, take a closer look. Check a message, screenshot or short video for warning signs.', 'リンクを開く前に、ひとまず確認。届いたメッセージやスクリーンショット、短い動画から注意点を探せます。', '링크를 열기 전에 잠시 확인해 보세요. 의심스러운 메시지, 스크린샷, 짧은 영상에서 주의할 점을 살펴볼 수 있어요.')}</p>
          <div className="home-actions">
            <Link to="/check" className="btn-primary"><HomeIcon kind="check" />{t('開始防詐查核', 'Check a message', 'メッセージを確認', '메시지 확인하기')}</Link>
            <Link to="/research" className="btn-secondary home-research-link"><HomeIcon kind="research" />{t('參加匿名研究測驗', 'Join the anonymous study', '匿名の研究テストに参加', '익명 연구 설문 참여하기')}</Link>
          </div>
        </div>
      </section>

      <section id="parcel-example" aria-labelledby="parcel-example-title" className="card home-guide-preview">
        <span className="home-parcel-icon"><HomeIcon kind="parcel" /></span>
        <div>
          <h2 id="parcel-example-title">{t('公開範例：包裹簡訊', 'Example: a parcel text', '公開サンプル：配送を装うSMS', '공개 예시: 배송 안내 문자')}</h2>
          <p>{t('先用一則虛構簡訊練習找警訊。閱讀範例無須提供自己的訊息，也不會留下研究紀錄。', 'Practise spotting warning signs in a fictional text. No personal message is needed and viewing the example creates no research record.', '架空のSMSで注意点を確認できます。自分のメッセージを入力する必要はなく、閲覧しても研究記録は残りません。', '가상의 문자로 주의할 점을 살펴보세요. 자신의 메시지를 입력할 필요가 없으며, 예시를 봐도 연구 기록은 남지 않습니다.')}</p>
        </div>
        <Link to="/guides/parcel-message" className="home-example-link">{t('閱讀範例', 'Read example', '例を読む', '예시 읽기')}<HomeIcon kind="arrow" /></Link>
      </section>

      <details className="card home-disclosure">
        <summary>{t('研究計畫', 'About the research', '研究について', '연구 소개')}</summary>
        <p>{t('本專題由三重商工資料處理科學生製作。我們想了解哪些詐騙特徵容易被忽略。你會先自行判斷一則模擬訊息，使用指定的查核輔助後，再判斷另一則難度相近的訊息。', 'Students in the Data Processing Department at Sanchong Commercial and Industrial Vocational High School in Taiwan created this project to study which scam signals people overlook. You assess one simulated message on your own, use an assigned checking aid, then assess another message of similar difficulty.', '台湾の三重商工・情報処理科の生徒が、見落とされやすい詐欺の兆候を調べるために制作しました。まず架空のメッセージを自分で判断し、指定の確認ツールを使った後、同程度の難しさの別のメッセージを判断します。', '대만 싼충상공 자료처리과 학생들이 어떤 사기 신호를 놓치기 쉬운지 알아보기 위해 만든 프로젝트입니다. 가상 메시지를 먼저 스스로 판단한 후, 지정된 확인 도구를 사용하고 비슷한 난이도의 다른 메시지를 판단합니다.')}</p>
        <p>{t('參與前會徵求同意，作答以匿名編號記錄。你可以隨時撤回同意或刪除研究資料。', 'We ask for your consent first. An anonymous ID identifies your answers. You can withdraw consent or delete your research data at any time.', '参加前に同意を確認し、回答は匿名の番号で記録します。同意の撤回や研究データの削除はいつでも可能です。', '참여하기 전에 동의를 받으며, 응답은 익명 번호로 기록합니다. 언제든 동의를 철회하거나 연구 자료를 삭제할 수 있습니다.')} <Link to="/privacy">{t('隱私與研究說明', 'Privacy and research details', 'プライバシーと研究の詳細', '개인정보 및 연구 안내')}</Link></p>
      </details>

      <details className="card home-disclosure">
        <summary>{t('查看更多：功能與限制', 'Features and limits', '機能と制限', '기능과 제한 사항')}</summary>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t(`文字最多 ${textLimit} 字。規則分析會標出可疑特徵，你也可以選擇與 Cofacts「真的假的」公開查核資料比對。`, `Text limit: ${textLimit} characters. Rules flag suspicious features. You can also compare your message with public fact-checks from Cofacts.`, `テキストは最大${textLimit}文字です。ルールに基づき注意点を表示します。任意でCofactsの公開ファクトチェックと照合できます。`, `텍스트는 최대 ${textLimit}자입니다. 규칙 분석으로 주의할 점을 표시하며, 선택하면 Cofacts의 공개 팩트체크 자료와 비교할 수 있습니다.`)}</li>
          <li>{t(`圖片支援 JPG、PNG、WebP，上限 ${imageMB} MB。`, `Images: JPG, PNG or WebP, up to ${imageMB} MB. `, `画像はJPG、PNG、WebPに対応し、上限は${imageMB} MBです。`, `이미지는 JPG, PNG, WebP 형식으로 최대 ${imageMB} MB까지 지원합니다. `)}{gemini ? t('選用 Gemini 可讀取圖片及圖中文字，AI 可能判讀錯誤。', 'Gemini can read the image and its text if selected. It can make mistakes.', 'Geminiを選ぶと画像や画像内の文字を読み取れますが、読み間違える場合があります。', 'Gemini를 선택하면 이미지와 그 안의 글자를 읽을 수 있지만 잘못 판독할 수 있습니다.') : t('AI 未啟用時，請手動輸入圖片中的文字。', 'When AI is unavailable, enter the text from the image yourself.', 'AIが無効の場合は、画像内の文字を手入力してください。', 'AI를 사용할 수 없을 때는 이미지 속 글자를 직접 입력하세요.')}</li>
          <li>{t(`影片支援 MP4、MOV，上限 ${videoMB} MB、${seconds} 秒。`, `Videos: MP4 or MOV, up to ${videoMB} MB and ${seconds} seconds. `, `動画はMP4とMOVに対応し、上限は${videoMB} MB、${seconds}秒です。`, `영상은 MP4, MOV 형식으로 최대 ${videoMB} MB, ${seconds}초까지 지원합니다. `)}{gemini ? t('勾選 AI 分析，Gemini 才會分析畫面與聲音。', 'Select AI analysis for Gemini to assess the picture and sound.', 'AI分析を選択すると、Geminiが映像と音声を分析します。', 'AI 분석을 선택하면 Gemini가 영상과 소리를 분석합니다.') : t('AI 未啟用時，請手動輸入旁白或畫面重點。', 'When AI is unavailable, describe what you see or hear.', 'AIが無効の場合は、映像や音声の要点を入力してください。', 'AI를 사용할 수 없을 때는 영상이나 음성의 주요 내용을 직접 입력하세요.')}</li>
          <li>{t('風險指數（0–100）是規則加權分數，不是詐騙機率或司法認定。Cofacts 查無資料不代表安全，比對到相似訊息也未必是同一事件。', 'The risk index (0–100) is a weighted rule score, not a probability of fraud or a legal finding. No Cofacts match does not establish safety, and a similar message can refer to a different event.', 'リスク指標（0～100）はルールに基づく加重スコアで、詐欺の確率や法的判断を示しません。Cofactsに該当情報がなくても安全とは限らず、似たメッセージも同じ事例とは限りません。', '위험 지수(0~100)는 규칙별 가중치를 합산한 점수이며 사기 확률이나 법적 판단이 아닙니다. Cofacts에서 일치하는 자료가 없어도 안전을 보장하지 않으며, 유사한 메시지가 다른 사건일 수도 있습니다.')}</li>
          <li>{t('Google Gemini 需由網站管理者設定。只有你勾選 AI 分析時，內容才會傳給 Google。', 'The site administrator must enable Google Gemini. Your content is sent to Google for AI analysis only if you select it.', 'Google Geminiは管理者による設定が必要です。AI分析を選んだときのみ、分析対象がGoogleに送信されます。', '사이트 관리자가 Google Gemini를 설정해야 합니다. AI 분석을 선택한 경우에만 해당 콘텐츠를 Google로 전송합니다.')}</li>
          <li>{t('網站架設於 Cloudflare。圖片與影片只做暫時處理。只有同意研究，才會保存遮蔽個資後的研究文字。', 'The site runs on Cloudflare. Images and videos are processed temporarily. Redacted text is retained for research only with consent.', '当サイトはCloudflareで運営しています。画像と動画は一時的に処理し、研究への同意がある場合に限り、個人情報を伏せたテキストを研究用に保存します。', '이 사이트는 Cloudflare에서 운영합니다. 이미지와 영상은 일시적으로만 처리하며, 연구에 동의한 경우에만 개인정보를 가린 텍스트를 연구용으로 보관합니다.')}</li>
        </ul>
      </details>
    </div>
  )
}
