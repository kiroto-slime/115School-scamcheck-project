"""研究流程：模擬案例、固定分組、前後測與輔助資訊。

模擬案例皆為團隊自行撰寫的虛構內容（不使用真實品牌、真實個資）。
種子案例預設為「待人工審核」：模擬模式下可使用（標示 DEMO），正式模式只使用已核准案例。
"""
from __future__ import annotations

import random

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import PatternDataset, ResearchCase, ResearchParticipant
from ..services.risk_analyzer import analyze_text

SEED_CASES = [
    ("easy", "scam", "假中獎通知", "恭喜您抽中最新款手機！請於今天內點擊 http://gift-prize.top 填寫收件地址，並支付運費 99 元完成領獎。",
     "中獎通知卻要求先付運費、可疑網域、時間壓力，為常見假中獎話術（團隊自行撰寫之模擬案例）。", "假中獎"),
    ("easy", "scam", "假冒同學借錢", "嗨！我是你國中同學啦，我換 LINE 了。最近很急需要用錢，可以先轉帳 5000 借我嗎？明天就還你，別告訴別人喔。",
     "自稱熟人換新帳號、急迫借錢且要求保密，未經原管道確認身分（模擬案例）。", "假冒親友"),
    ("easy", "legit", "學校社團公告", "【學務處公告】本週五第七節社團活動改至體育館舉行，請各社團幹部提前 10 分鐘到場佈置，謝謝配合。",
     "一般校內公告，未要求付款、個資或點擊連結（模擬案例）。", "正常通知"),
    ("medium", "scam", "二手交易假認證", "我這邊用賣貨便出貨，你下單後客服會傳連結給你做「實名認證」，要輸入網銀帳號密碼才能完成交易喔。",
     "交易平台不會要求買家輸入網銀帳密做認證，屬假客服認證話術（模擬案例）。", "網路購物"),
    ("medium", "legit", "購物平台出貨通知", "【好物網】您的訂單已出貨，可至 App 內「我的訂單」查看物流進度。本訊息不含任何連結，請勿回覆。",
     "虛構平台的出貨通知，未要求付款或個資，並引導使用官方 App 查詢（模擬案例）。", "正常通知"),
    ("medium", "scam", "投資群組帶單", "加入我們的股票分析群，老師每天帶單，上個月學員平均獲利 30%，名額有限，快加賴 @stock888 領取飆股。",
     "保證高獲利、名額壓力與導流私人群組，為常見投資詐騙特徵（模擬案例）。", "假投資"),
    ("hard", "scam", "包裹地址補件", "您好，您的包裹因地址不完整暫時無法投遞，請於 48 小時內回覆完整地址與收件人生日，以便重新安排配送。",
     "物流業者不需生日即可配送；以補件為由蒐集個資，常用於後續詐騙（模擬案例）。", "假物流"),
    ("hard", "legit", "班級校外教學收費", "同學好，下週二校外教學費用 350 元，請於週五前交給班級總務，收據會由學務處統一開立。",
     "雖然涉及付款，但為面對面繳交給已知同學，並有學校開立收據，屬正常校務（模擬案例）。", "正常通知"),
    ("hard", "legit", "平台安全提醒", "【好物網】提醒您：我們不會以電話或訊息要求您提供驗證碼或密碼。如有疑問，請由 App 內客服中心聯繫。",
     "內容提到驗證碼，但是在提醒使用者不要提供，並引導至官方管道（模擬案例）。", "正常通知"),
]

SEED_PATTERNS = [
    ("假冒客服解除分期", "權威＋恐懼", "自稱客服、誤設分期、要求操作 ATM 或網銀", "掛斷後自行撥打官方客服電話確認；ATM 無法解除分期。"),
    ("假投資", "貪婪＋從眾", "保證獲利、老師帶單、加入私人群組", "合法投資不保證獲利；不加入不明投資群組。"),
    ("假網拍認證", "權威＋急迫", "要求點擊認證連結並輸入網銀帳密", "只在官方 App 內完成交易，不在外部連結輸入帳密。"),
    ("假冒親友借錢", "信任＋情感", "換新帳號、急需用錢、要求保密", "用原本電話或當面確認身分。"),
    ("求職打工詐騙", "貪婪＋缺乏經驗", "高薪輕鬆、要求提供提款卡或帳戶", "不出租、出借帳戶與提款卡，避免成為人頭帳戶。"),
]

GENERAL_TIPS = [
    "遇到要求匯款、轉帳或購買點數的訊息，先停下來查證。",
    "不要提供驗證碼、密碼或證件照片給任何人。",
    "不要點擊不明連結，改用官方 App 或官方網站查詢。",
    "有疑問可撥打 165 反詐騙專線，或詢問家人、老師。",
]

PHASES = ("pre", "post_initial", "post_assisted")
ASSISTANCE_BY_GROUP = {"A": "general_tips", "B": "system_evidence"}


def seed_reference_data(db: Session) -> None:
    if not db.scalar(select(func.count()).select_from(ResearchCase)):
        for diff, label, title, content, basis, cat in SEED_CASES:
            db.add(ResearchCase(title=title, simulated_content=content, verified_label=label, label_basis=basis,
                                difficulty=diff, category=cat, reviewer_status="pending"))
    if not db.scalar(select(func.count()).select_from(PatternDataset)):
        for cat, trig, ind, prev in SEED_PATTERNS:
            db.add(PatternDataset(scam_category=cat, psychological_trigger=trig, risk_indicators=ind, prevention_method=prev,
                                  verification_status="draft", evidence_source="研究團隊自行整理（待人工審查）",
                                  source_license="團隊自製內容", human_review_status="pending"))
    db.commit()


def eligible_cases(db: Session, formal: bool) -> list[ResearchCase]:
    q = select(ResearchCase).where(ResearchCase.reviewer_status == "approved") if formal else \
        select(ResearchCase).where(ResearchCase.reviewer_status != "rejected")
    return list(db.scalars(q))


def pick_case_pair(cases: list[ResearchCase], rng: random.Random | None = None) -> tuple[ResearchCase, ResearchCase] | None:
    """前測與後測使用「不同但難度相同」的案例，避免用同一題重複作答造成假改善。"""
    rng = rng or random.SystemRandom()
    by_diff: dict[str, list[ResearchCase]] = {}
    for c in cases:
        by_diff.setdefault(c.difficulty, []).append(c)
    pools = [v for v in by_diff.values() if len(v) >= 2]
    if not pools:
        return None
    pool = rng.choice(pools)
    a, b = rng.sample(pool, 2)
    return a, b


def assign_group(db: Session, mode: str, is_demo: bool) -> str:
    if mode in ("A", "B"):
        return mode
    counts = {g: db.scalar(select(func.count()).select_from(ResearchParticipant)
                           .where(ResearchParticipant.experiment_group == g, ResearchParticipant.is_demo == is_demo)) or 0
              for g in ("A", "B")}
    if counts["A"] == counts["B"]:
        return random.SystemRandom().choice(["A", "B"])
    return "A" if counts["A"] < counts["B"] else "B"


def build_assistance(group: str, case: ResearchCase) -> dict:
    if group == "A":
        return {"type": "general_tips", "title": "一般防詐提醒", "tips": GENERAL_TIPS}
    r = analyze_text(case.simulated_content)
    return {
        "type": "system_evidence", "title": "本網站的風險解釋",
        "risk_level": r.risk_level, "risk_score": r.risk_score,
        "features": [f.to_dict() for f in r.features], "basis": r.basis,
        "source_note": "研究模擬案例不進行外部 Cofacts 查詢。",
        "disclaimer": "風險指數為規則加權分數，不是詐騙機率。",
    }
