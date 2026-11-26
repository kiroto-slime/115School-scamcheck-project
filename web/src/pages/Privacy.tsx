import { studyMessage } from './studyMessages'
import { useLanguage } from '../language'
import { useState } from 'react'
import { ApiError, postJson, researchId, researchWithdrawn } from '../api'
import { Alert, Section } from '../components/ui'

export default function Privacy() {
  const { lang, t } = useLanguage()
  const [rid, setRid] = useState(researchId.get() ?? '')
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const valid = /^R[A-Z0-9]{12}$/.test(rid.trim())

  const act = async (kind: 'withdraw' | 'delete') => {
    setMsg(null)
    try {
      const r = kind === 'withdraw'
        ? await postJson<{ message: string }>('/api/consent', { research_id: rid.trim(), purpose: 'research', status: 'withdrawn' })
        : await postJson<{ message: string }>('/api/privacy/delete', { research_id: rid.trim() })
      if ((kind === 'delete' || kind === 'withdraw') && researchId.get() === rid.trim()) researchId.clear()
      // 撤回後查核頁不再預設勾選「協助校內研究」，避免下次查核又自動同意
      if (kind === 'withdraw') researchWithdrawn.set()
      setMsg({ kind: 'success', text: r.message })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : '操作失敗，請稍後再試。' })
    } finally {
      setConfirmDelete(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1>{t("隱私與研究說明", "Privacy and research", "プライバシーと研究について", "개인정보 및 연구 안내")}</h1>
      <Section title={t("我們蒐集什麼、為什麼", "What we collect and why", "収集するデータと目的", "수집하는 데이터와 목적")}>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>{t("必要的暫時處理：", "Temporary processing. ", "確認に必要な一時処理：", "확인에 필요한 일시 처리: ")}</strong>{t(
            "為完成你這次的查核，伺服器會暫時處理你輸入的文字或上傳的檔案。原始圖片、影片處理完即刪除；未同意研究者，不把訊息內容寫入資料庫。同意研究者，只保存已遮蔽姓名、地址、電話、Email、證號、帳號、車牌後的文字與去參數網址，保存到專題結束（由後台設定日期）。圖片、影片檔不保存，只保存你補充的文字與 AI 對內容的文字描述（同樣經遮蔽）。系統會盡力自動遮蔽，仍可能漏遮；請勿在內容中填寫他人的個資。",
            "The server temporarily processes your text or files to complete your check. Original images and videos are deleted after processing. Without research consent, message content is not written to the database. With consent, we keep only text with names, addresses, phone numbers, email addresses, identification numbers, account numbers and license plates masked, and URLs with query parameters removed. These are kept until the project end date set by the administrator. For images and videos, we keep only your accompanying text and the AI’s description, both masked. Automatic masking can miss details. Please leave other people’s personal information out of your submission.",
            "確認のため、サーバーは入力テキストやアップロードされたファイルを一時処理し、元の画像・動画は処理後に削除します。研究への同意がない場合、メッセージ内容はデータベースに保存しません。同意がある場合は、氏名、住所、電話番号、メールアドレス、身分証番号、口座・アカウント番号、車両番号を伏せたテキストと、クエリパラメーターを除いたURLのみを、管理者が設定した研究終了日まで保存します。画像・動画ファイルは保存せず、補足テキストとAIによる説明文のみを同様にマスキングして保存します。自動処理で隠しきれない場合があるため、他の方の個人情報は入力しないでください。",
            "메시지를 확인하기 위해 서버가 입력한 글이나 업로드한 파일을 일시적으로 처리하며, 원본 이미지와 동영상은 처리 후 삭제합니다. 연구에 동의하지 않으면 메시지 내용을 데이터베이스에 저장하지 않습니다. 동의하면 이름, 주소, 전화번호, 이메일, 신분증 번호, 계좌·계정 번호, 차량 번호를 가린 텍스트와 쿼리 매개변수를 제거한 URL만 관리자가 설정한 프로젝트 종료일까지 저장합니다. 이미지·동영상 파일은 보관하지 않으며, 추가로 입력한 글과 AI가 생성한 설명문만 개인정보를 가린 뒤 보관합니다. 자동 처리 과정에서 누락될 수 있으니 다른 사람의 개인정보를 입력하지 마세요.",
          )}</li>
          <li><strong>{t("自願的校內研究：", "Optional school research. ", "任意の校内研究：", "선택 사항인 교내 연구: ")}</strong>{t(
            "只在查核頁「協助校內研究」為勾選狀態時（預設勾選，可取消），保存已遮蔽個資的訊息內容與去參數網址、分析結果（風險特徵、等級、媒體類型）與研究測驗的作答（判斷、理由選項、作答時間）。",
            "Only when “Support school research” is checked on the check page (selected by default and can be cleared) do we retain masked message content, URLs without query parameters, analysis results (risk indicators, level and media type), and study answers (judgment, selected reason and response time).",
            "確認画面の「校内研究に協力する」にチェックがある場合（初期状態はオン、解除可能）のみ、個人情報を伏せたメッセージ、クエリパラメーターを除いたURL、分析結果（リスクの特徴・レベル・メディアの種類）、研究テストの回答（判断・選んだ理由・回答時間）を保存します。",
            "확인 화면에서 ‘교내 연구 참여’가 선택되어 있을 때만(기본 선택, 해제 가능) 개인정보를 가린 메시지, 쿼리 매개변수를 제거한 URL, 분석 결과(위험 징후, 등급, 매체 유형), 연구 퀴즈 응답(판단, 선택한 근거, 응답 시간)을 보관합니다.",
          )}</li>
          <li><strong>{t("自願的衍生用途：", "Optional secondary use. ", "任意の二次利用：", "선택 사항인 2차 이용: ")}</strong>{t(
            "只在你另外同意後，經人工審查的「彙總統計」才可能用於教育產品與商業可行性研究。不會販售或公開任何個別投稿。",
            "Only with your separate consent may aggregate statistics reviewed by a person be used for educational products and commercial feasibility research. Individual submissions are never sold or published.",
            "別途同意をいただいた場合に限り、人による審査を経た集計統計を教育用製品や事業化の可能性を調べる研究に使用することがあります。個人の投稿を販売・公開することはありません。",
            "별도로 동의한 경우에만 담당자가 검토한 집계 통계를 교육 제품 및 사업 타당성 연구에 활용할 수 있습니다. 개별 제보는 판매하거나 공개하지 않습니다.",
          )}</li>
          <li>{t(
            "我們不主動要求你提供姓名、學號、電話、身分證等身分資訊，使用隨機產生的研究編號；內容中若含有這類資訊，會盡力自動遮蔽。",
            "We use a random research ID. We do not ask for your name, student ID, phone number or national ID. If such details appear in your submission, we try to mask them automatically.",
            "研究には無作為に発行するIDを使用します。氏名、学籍番号、電話番号、身分証番号などの提供は求めません。入力内容に含まれている場合は、自動で伏せるよう努めます。",
            "무작위로 생성한 연구 ID를 사용하며 이름, 학번, 전화번호, 신분증 번호 등 신원 정보는 요청하지 않습니다. 입력 내용에 포함된 경우 자동으로 가리도록 처리합니다.",
          )}</li>
        </ul>
      </Section>
      <Section title={t("資料傳輸與第三方", "Data transfers and third parties", "データの送信と第三者", "데이터 전송 및 제3자")}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t(
            "若你勾選「送至 Cofacts 比對」，文字會在遮蔽手機、身分證、Email、長數字後送到 Cofacts「真的假的」官方公開 API 查詢（Cofacts 是臺灣的公民協作查核資料庫）。不勾選就不會送出。Cofacts 回傳的查核內容以 CC BY-SA 4.0 授權並標示來源。",
            "If you select Cofacts, we mask mobile numbers, national ID numbers, email addresses and long digit strings before sending text to the official public API of Cofacts, Taiwan’s collaborative fact-checking database. If unchecked, nothing is sent to Cofacts. Returned fact checks credit the source and use the CC BY-SA 4.0 license.",
            "Cofacts への照会を選んだ場合は、携帯電話番号、身分証番号、メールアドレス、長い数字列を伏せたうえで、台湾の市民参加型ファクトチェックデータベース Cofacts の公式公開 API にテキストを送ります。選ばない場合は送信しません。Cofacts の回答は出典を明示し、CC BY-SA 4.0 に基づいて掲載します。",
            "Cofacts 대조를 선택하면 휴대전화 번호, 신분증 번호, 이메일 주소와 긴 숫자열을 가린 뒤 대만 시민 협업 팩트체크 데이터베이스 Cofacts의 공식 공개 API에 텍스트를 전송합니다. 선택하지 않으면 전송하지 않습니다. Cofacts의 확인 결과에는 출처를 표시하며 CC BY-SA 4.0 라이선스를 적용합니다.",
          )}</li>
          <li>{t(
            "若網站已設定 Gemini 且你勾選「使用 AI 分析」，文字（先遮蔽個資）、圖片與影片會送到 Google Gemini API 分析，並要求 Google 不保存這次請求。使用 Google 免費方案時，Google 可能依其條款使用送出的內容改進服務，因此",
            "If Gemini is configured and you select AI analysis, text (with personal information masked), images and videos are sent to the Google Gemini API. We request that Google not retain the request. Under its free-tier terms, Google may use submitted content to improve its services. ",
            "サイトで Gemini が設定され、AI 分析を選んだ場合は、個人情報を伏せたテキストと画像・動画を Google Gemini API に送り、リクエストを保存しないよう Google に求めます。無料プランでは、規約に基づき送信内容がサービス改善に使われる場合があります。",
            "사이트에 Gemini가 설정되어 있고 AI 분석을 선택하면 개인정보를 가린 텍스트와 이미지·동영상을 Google Gemini API로 보내며 Google에 해당 요청을 저장하지 않도록 요청합니다. 무료 요금제에서는 Google이 약관에 따라 제출된 내용을 서비스 개선에 사용할 수 있습니다. ",
          )}<strong>{t("請勿上傳含有他人隱私或敏感資訊的內容", "Do not upload anyone else’s private or sensitive information", "他の方のプライベートな情報や機微な情報はアップロードしないでください", "다른 사람의 사생활이나 민감한 정보가 포함된 내용은 업로드하지 마세요")}</strong>{t("。不勾選就不會送出。", ". If unchecked, nothing is sent to Gemini.", "。選ばない場合、Gemini に送信しません。", ". 선택하지 않으면 Gemini로 전송하지 않습니다.")}</li>
          <li>{t(
            "本網站架設在 Cloudflare（Workers 與 D1 資料庫），研究資料存放在 Cloudflare 的資料中心。",
            "This site runs on Cloudflare Workers and the D1 database. Research data is stored in Cloudflare data centers.",
            "このサイトは Cloudflare Workers と D1 データベースを使用し、研究データは Cloudflare のデータセンターに保存します。",
            "이 사이트는 Cloudflare Workers와 D1 데이터베이스를 사용하며 연구 데이터는 Cloudflare 데이터 센터에 보관합니다.",
          )}</li>
          <li>{t("網站不會開啟或連線你訊息中的網址。", "This site does not open or connect to the URLs in your message.", "このサイトはメッセージ内のURLを開いたり、接続したりしません。", "이 사이트는 메시지에 포함된 URL을 열거나 해당 주소에 접속하지 않습니다.")}</li>
        </ul>
      </Section>
      <Section title={t("保存期限", "Retention periods", "保存期間", "보관 기간")}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t(
            "未同意研究的分析結果（不含原文）：保存 30 天，讓你可以從「查核紀錄」回來查看，之後自動刪除。",
            "Without research consent, analysis results (excluding your original text) are kept for 30 days so you can reopen them from Check history. They are then deleted automatically.",
            "研究に同意しない場合、原文を含まない分析結果を30日間保存します。この間は確認履歴から再表示でき、その後自動削除されます。",
            "연구에 동의하지 않으면 원문을 제외한 분석 결과를 30일간 보관합니다. 이 기간에는 확인 기록에서 다시 볼 수 있으며 이후 자동 삭제됩니다.",
          )}</li>
          <li>{t(
            "你的瀏覽器會暫存：①查核頁還沒送出的草稿（關掉分頁就清除）；②「查核紀錄」清單（只有結果編號、風險等級、時間和主要原因，不含你輸入的原文），存在你自己的瀏覽器，可隨時在「查核紀錄」頁清除。使用公用電腦時，用完請清除紀錄。",
            "Your browser keeps unsent drafts until you close the tab. It also stores your check history, containing only the result ID, risk level, time and main reason, without the text you entered. You can clear this list from Check history at any time. Please clear it after using a shared computer.",
            "ブラウザーは未送信の下書きをタブを閉じるまで保存します。また、確認履歴には結果ID、リスクレベル、時刻、主な理由のみを保存し、入力した原文は含みません。履歴画面からいつでも消去できます。公共のパソコンを使った後は履歴を消去してください。",
            "브라우저는 제출 전 초안을 탭을 닫을 때까지 저장합니다. 확인 기록 목록에는 결과 ID, 위험 등급, 시간, 주요 근거만 저장하며 입력한 원문은 포함하지 않습니다. 확인 기록 화면에서 언제든 지울 수 있습니다. 공용 컴퓨터를 썼다면 사용 후 기록을 지워 주세요.",
          )}</li>
          <li>{t(
            "已同意研究者的訊息內容（已遮蔽個資）與去參數網址：保存至專題結束（後台設定的保存日期），到期後內容自動清空；整筆研究資料最長 2 年（可由管理者設定）。",
            "With research consent, masked messages and URLs without query parameters are kept until the project end date set by the administrator, then cleared automatically. The entire research record is kept for up to two years, as configured by the administrator.",
            "研究に同意した場合、個人情報を伏せたメッセージとクエリパラメーターを除いたURLは、管理者が設定した研究終了日まで保存され、その後自動的に消去されます。研究記録全体の保存期間は管理者の設定により最長2年間です。",
            "연구에 동의하면 개인정보를 가린 메시지와 쿼리 매개변수를 제거한 URL을 관리자가 설정한 프로젝트 종료일까지 보관하고 이후 내용을 자동 삭제합니다. 전체 연구 기록은 관리자 설정에 따라 최대 2년간 보관합니다.",
          )}</li>
          <li>{t(
            "上傳檔案：本網站不保存；影片交給 Gemini 分析後立即刪除 Google 上的檔案（Google 也會在 48 小時內自動刪除）。",
            "Uploaded files are not retained by this site. After Gemini analyzes a video, we immediately delete the file from Google. Google also deletes it automatically within 48 hours.",
            "サイトではアップロードファイルを保管しません。Gemini での動画分析後、Google 上のファイルを直ちに削除します。Google 側でも48時間以内に自動削除されます。",
            "이 사이트는 업로드한 파일을 보관하지 않습니다. Gemini에서 동영상 분석이 끝나면 Google에 있는 파일을 즉시 삭제합니다. Google도 48시간 이내에 자동으로 삭제합니다.",
          )}</li>
        </ul>
      </Section>
      <Section title={t("你的權利", "Your rights", "参加者の権利", "참여자의 권리")}>
        <p>{t(
          "你可以隨時撤回同意（之後不再蒐集），或刪除你研究編號底下的所有研究資料。撤回或拒絕不影響查核服務。",
          "You can withdraw consent at any time to stop future collection, or delete all research data under your research ID. Declining or withdrawing consent does not affect message checking.",
          "同意はいつでも撤回でき、その後の収集は停止します。研究IDにひも付くすべての研究データを削除することもできます。辞退や撤回後もメッセージ確認を利用できます。",
          "언제든지 동의를 철회해 이후 수집을 중단하거나 연구 ID에 연결된 모든 연구 데이터를 삭제할 수 있습니다. 거부하거나 철회해도 메시지 확인 서비스는 계속 이용할 수 있습니다.",
        )}</p>
        <div>
          <label htmlFor="rid" className="label">{t("研究編號", "Research ID", "研究ID", "연구 ID")}</label>
          <input id="rid" className="input font-mono" value={rid} maxLength={13} placeholder={t("R 開頭共 13 碼", "13 characters starting with R", "Rで始まる13文字", "R로 시작하는 13자리")} onChange={(e) => setRid(e.target.value.toUpperCase())} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn-secondary" disabled={!valid} onClick={() => act('withdraw')}>{t("撤回研究同意", "Withdraw research consent", "研究への同意を撤回", "연구 동의 철회")}</button>
          {confirmDelete ? (
            <>
              <button className="btn-danger" onClick={() => act('delete')}>{t("確定刪除（無法復原）", "Confirm permanent deletion", "完全に削除する（復元不可）", "영구 삭제 확인(복구 불가)")}</button>
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>{t("取消", "Cancel", "キャンセル", "취소")}</button>
            </>
          ) : (
            <button className="btn-danger" disabled={!valid} onClick={() => setConfirmDelete(true)}>{t("刪除我的研究資料", "Delete my research data", "自分の研究データを削除", "내 연구 데이터 삭제")}</button>
          )}
        </div>
        {msg && <Alert kind={msg.kind}>{studyMessage(lang, msg.text)}</Alert>}
      </Section>
      <Section title={t("未成年參與者注意事項", "Participants under 18", "未成年の参加者について", "미성년 참여자 안내")}>
        <p>{t(
          "本專題預計邀請高中學生參與。正式研究前須經學校審查，並依規定取得法定代理人同意；在核准前，系統只使用模擬研究模式（資料標示為 DEMO，不列入正式研究）。",
          "The project plans to invite high school students to participate. The formal study requires school review and consent from legal guardians as required. Until approval, the system runs only in simulation mode. Data is labeled DEMO and excluded from the formal study.",
          "本研究では高校生の参加を予定しています。正式な研究の前に学校の審査を受け、規定に従って法定代理人の同意を得る必要があります。承認までは模擬研究モードのみを使用し、データには DEMO と表示して正式な研究から除外します。",
          "이 프로젝트는 고등학생의 참여를 예정하고 있습니다. 정식 연구 전에 학교 심사를 받고 규정에 따라 법정 대리인의 동의를 얻어야 합니다. 승인 전에는 모의 연구 모드만 사용하며 데이터에 DEMO를 표시하고 정식 연구에서 제외합니다.",
        )}</p>
      </Section>
      <Section title={t("聯絡方式", "Contact", "お問い合わせ", "문의 방법")}>
        <p>{t(
          "如有疑問或需要協助撤回、刪除資料，請聯絡專題研究團隊或指導老師（聯絡方式由學校公告）。",
          "For questions or help withdrawing consent or deleting data, contact the project team or supervising teacher using the contact details published by the school.",
          "ご質問や同意撤回・データ削除のご相談は、学校が案内する連絡先から研究チームまたは指導教員にお問い合わせください。",
          "질문이 있거나 동의 철회 또는 데이터 삭제에 도움이 필요하면 학교가 공지한 연락처로 연구팀이나 지도 교사에게 문의해 주세요.",
        )}</p>
      </Section>
    </div>
  )
}
