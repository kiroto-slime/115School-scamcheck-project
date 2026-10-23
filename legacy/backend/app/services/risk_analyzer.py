"""可解釋的規則式風險分析器（RiskAnalyzer）。

- 風險指數 0-100 只是「規則加權分數」，不是經統計校準的詐騙機率。
- 分析結果不是司法認定或正式詐騙判決。
- 未偵測到特徵時回報「資訊不足」，而不是「安全」。
"""
from __future__ import annotations

from dataclasses import dataclass, field
import re
import unicodedata
from urllib.parse import urlparse

RULE_VERSION = "rules-2026.10-v0.1"

LEVEL_LOW, LEVEL_MID, LEVEL_HIGH, LEVEL_INSUFFICIENT = "低", "中", "高", "資訊不足"
MIN_TEXT_CHARS = 12


@dataclass(frozen=True)
class Rule:
    feature_id: str
    label: str
    description: str
    weight: int
    keywords: tuple[str, ...] = ()
    patterns: tuple[str, ...] = ()
    human_verified: bool = False  # 尚未經研究團隊人工驗證


RULES: tuple[Rule, ...] = (
    Rule("urgency", "急迫時間壓力", "以時間限制或倒數逼迫你立即行動，降低思考時間。", 15,
         ("立即", "立刻", "馬上", "儘快", "盡快", "限時", "今天內", "24小時內", "最後一天", "逾期", "倒數", "名額有限", "即將失效", "即將停用", "最後機會"),
         (r"\d+\s*(分鐘|小時)內",)),
    Rule("authority", "冒充官方或權威機構", "自稱政府、警察、銀行、電商或物流等機構，藉權威取得信任。", 15,
         ("警察", "警局", "檢察官", "地檢署", "法院", "刑事局", "165", "國稅局", "健保署", "監理站", "銀行客服", "官方客服", "郵局", "中華郵政", "海關", "金管會"),
         ()),
    Rule("financial_request", "要求付款或匯款", "要求匯款、轉帳、儲值、購買點數或先付費用。", 25,
         ("匯款", "轉帳", "ATM", "atm", "解除分期", "儲值", "點數卡", "遊戲點數", "保證金", "手續費", "解凍金", "代墊", "先付", "訂金", "加值", "USDT", "虛擬貨幣", "比特幣", "面交"),
         ()),
    Rule("personal_data", "要求提供個人資料", "要求身分證、住址、生日、存摺等個人資料。", 15,
         ("身分證", "身份證", "健保卡", "存摺", "生日", "住址", "地址", "證件照", "自拍照", "手持證件", "個資"),
         ()),
    Rule("credential_request", "要求帳號或驗證碼", "要求提供密碼、OTP 驗證碼、網銀帳密或登入資訊。", 25,
         ("驗證碼", "簡訊碼", "OTP", "otp", "密碼", "帳號密碼", "網銀", "登入連結", "認證碼", "提款卡"),
         ()),
    Rule("suspicious_link", "可疑網址或導流", "包含縮網址、IP 網址、非常見網域或要求加入私人 LINE / Telegram。", 20,
         ("加LINE", "加 LINE", "加賴", "私訊我", "Telegram", "telegram", "點擊連結", "點選連結", "掃描QR", "掃QR"),
         ()),
    Rule("guaranteed_reward", "保證獲利或獎勵", "宣稱穩賺不賠、高報酬、中獎或免費贈品。", 20,
         ("保證獲利", "穩賺", "穩賺不賠", "零風險", "高報酬", "日賺", "月入", "躺著賺", "中獎", "恭喜您", "免費領", "抽中", "飆股", "帶單", "老師帶", "內線", "翻倍"),
         (r"(報酬|獲利|收益)\s*\d+\s*%",)),
    Rule("emotional_pressure", "恐懼、威脅或情感操控", "以威脅、恐嚇、羞辱或情感依附施壓。", 15,
         ("凍結", "停權", "通緝", "逮捕", "涉嫌", "洗錢", "法律責任", "提告", "不要告訴", "別告訴", "保密", "出事", "很急", "救我", "被扣款"),
         ()),
    Rule("impersonation", "假冒特定身分", "自稱親友、網紅、客服或熟人換了新帳號。", 15,
         ("我換手機", "我換號碼", "猜猜我是誰", "新的LINE", "新帳號", "我是客服", "專員", "我是你", "老同學"),
         ()),
    Rule("other", "其他可疑特徵", "例如出租帳戶、代收包裹、高薪輕鬆打工等常見詐騙或人頭帳戶話術。", 10,
         ("出租帳戶", "租借帳戶", "提供帳戶", "借帳戶", "代收包裹", "代領包裹", "高薪", "輕鬆賺", "免經驗", "家庭代工", "日領", "跑腿費"),
         ()),
)

URL_RE = re.compile(r"(?:https?://|www\.)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+", re.IGNORECASE)
BARE_DOMAIN_RE = re.compile(r"(?<![a-z0-9-])[a-z0-9-]+\.(?:top|xyz|icu|cc|vip|shop|club|live|site|online|buzz|tk)(?![a-z0-9])", re.IGNORECASE)
SHORTENERS = {"bit.ly", "reurl.cc", "tinyurl.com", "lihi.cc", "lihi1.com", "lihi2.cc", "pse.is", "ppt.cc", "t.ly", "is.gd", "cutt.ly", "goo.gl"}
RISKY_TLDS = {"top", "xyz", "icu", "cc", "vip", "shop", "club", "live", "site", "online", "buzz", "tk"}
CHAT_REDIRECT = {"line.me", "lin.ee", "t.me"}
COMBOS = (({"urgency", "financial_request"}, 10), ({"authority", "credential_request"}, 10), ({"authority", "emotional_pressure"}, 10), ({"guaranteed_reward", "suspicious_link"}, 10))

SAFE_ACTIONS = {
    "financial_request": "不要依對方指示匯款、轉帳或購買點數；先暫停並與家人或師長討論。",
    "credential_request": "任何人索取驗證碼、密碼都不要提供；正規機構不會用訊息要你提供。",
    "personal_data": "不要提供身分證、存摺或證件照片給不明對象。",
    "suspicious_link": "不要點擊訊息中的連結；改用官方 App 或自行輸入官方網址查詢。",
    "authority": "掛斷或停止回覆，自行查官方電話回撥確認，或撥打 165 反詐騙專線。",
    "urgency": "越被催促越要停下來，給自己時間查證。",
    "guaranteed_reward": "保證獲利、高報酬幾乎都是詐騙常見話術，不要加入不明投資群組。",
    "emotional_pressure": "遇到威脅或要求保密時，先告訴信任的大人。",
    "impersonation": "親友說換了新帳號時，先用原本的電話或當面確認身分。",
    "other": "不要出租、出借帳戶或代收包裹，這可能讓你成為詐騙集團的人頭而觸法。",
}
GENERAL_ACTION = "如仍有疑慮，可撥打 165 反詐騙諮詢專線或向家人、老師確認。"


@dataclass
class Feature:
    feature_id: str
    label: str
    description: str
    triggers: list[str]
    rule_version: str
    human_verified: bool

    def to_dict(self) -> dict:
        return self.__dict__.copy()


@dataclass
class RiskResult:
    risk_level: str
    risk_score: int | None
    features: list[Feature] = field(default_factory=list)
    basis: list[str] = field(default_factory=list)
    safe_actions: list[str] = field(default_factory=list)
    rule_version: str = RULE_VERSION

    @property
    def tags(self) -> list[str]:
        return [f.feature_id for f in self.features]


def normalize(text: str) -> str:
    """全形轉半形、去除多餘空白，降低規避字元的影響。"""
    text = unicodedata.normalize("NFKC", text or "")
    return re.sub(r"\s+", " ", text).strip()


def _url_triggers(text: str) -> list[str]:
    """只分析網址字串本身，絕不連線或開啟網址。觸發依據只記網域類型，不記完整網址。"""
    triggers: list[str] = []
    for raw in URL_RE.findall(text):
        host = (urlparse(raw if "://" in raw else "http://" + raw).hostname or "").lower()
        if not host:
            continue
        if host in SHORTENERS:
            triggers.append(f"縮網址（{host}）")
        elif re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", host):
            triggers.append("以 IP 位址組成的網址")
        elif host.startswith("xn--") or ".xn--" in host:
            triggers.append("國際化（punycode）網域")
        elif host.rsplit(".", 1)[-1] in RISKY_TLDS:
            triggers.append(f"較常被濫用的網域結尾（.{host.rsplit('.', 1)[-1]}）")
        elif any(host == d or host.endswith("." + d) for d in CHAT_REDIRECT):
            triggers.append("導流至私人通訊軟體")
        else:
            triggers.append("包含外部網址（未自動開啟）")
    if not triggers and BARE_DOMAIN_RE.search(text):
        triggers.append("疑似網址（非常見網域結尾）")
    return triggers


def analyze_text(text: str, source_signals: list[dict] | None = None) -> RiskResult:
    clean = normalize(text)
    features: list[Feature] = []
    for rule in RULES:
        hits = [k for k in rule.keywords if k in clean]
        hits += [f"符合樣式：{p}" for p in rule.patterns if re.search(p, clean)]
        if rule.feature_id == "suspicious_link":
            hits += _url_triggers(clean)
        if hits:
            features.append(Feature(rule.feature_id, rule.label, rule.description, sorted(set(hits))[:6], RULE_VERSION, rule.human_verified))

    basis: list[str] = []
    score = 0
    found = {f.feature_id for f in features}
    for f in features:
        rule = next(r for r in RULES if r.feature_id == f.feature_id)
        bonus = min(len(f.triggers) - 1, 2) * 3
        score += rule.weight + bonus
        basis.append(f"偵測到「{f.label}」：{('、'.join(f.triggers))}")
    for combo, extra in COMBOS:
        if combo <= found:
            score += extra
            basis.append("多種高風險特徵同時出現（組合加權）")

    # 來源訊號：Cofacts 已查核為不實／詐騙的相似內容才加分；查無資料不代表安全
    for sig in source_signals or []:
        if sig.get("reply_type") == "RUMOR":
            extra = 25 if sig.get("match_type") == "exact" else 10
            score += extra
            basis.append(f"Cofacts 有{'相同' if sig.get('match_type') == 'exact' else '相似'}訊息被查核為含有不實訊息（相似不等於同一事件）")

    score = min(score, 100)

    if len(clean) < MIN_TEXT_CHARS and not features:
        level, score_out = LEVEL_INSUFFICIENT, None
        basis.append("內容過短，無法判斷。")
    elif not features and score == 0:
        level, score_out = LEVEL_INSUFFICIENT, 0
        basis.append("未偵測到規則庫中的已知風險特徵，但這不代表訊息安全。")
    else:
        score_out = score
        level = LEVEL_HIGH if score >= 60 else LEVEL_MID if score >= 30 else LEVEL_LOW

    actions = [SAFE_ACTIONS[f.feature_id] for f in features if f.feature_id in SAFE_ACTIONS]
    actions.append(GENERAL_ACTION)
    return RiskResult(level, score_out, features, basis, actions)


def redact_pii(text: str) -> str:
    """送往第三方查核前，先遮蔽常見個資（身分證、手機、Email、長數字帳號）。"""
    # 不用 \b：中文字也算「字元」，\b 在中英混排時會失效
    text = re.sub(r"(?<![A-Za-z0-9])[A-Z][12]\d{8}(?!\d)", "[身分證]", text)
    text = re.sub(r"(?<!\d)09\d{2}[- ]?\d{3}[- ]?\d{3}(?!\d)", "[手機]", text)
    text = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+", "[Email]", text)
    text = re.sub(r"(?<!\d)\d{10,16}(?!\d)", "[數字帳號]", text)
    return text
