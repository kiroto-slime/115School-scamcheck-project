"""Cofacts 官方 GraphQL API 介接（https://api.cofacts.tw/）。

- 憑證只從環境變數讀取；沒有憑證時使用 MockCofactsAdapter，且「不產生任何虛構查核回覆」。
- 相似資料不等於同一事件；查無資料不代表沒有詐騙風險。
- Cofacts 資料以 CC BY-SA 4.0 授權，顯示時必須標示來源與授權。
- 不爬取 Cofacts 網站。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
import difflib
import re
import threading
import time

import httpx

from ..config import Settings

LICENSE = "CC BY-SA 4.0"
ARTICLE_URL = "https://cofacts.tw/article/{id}"
REPLY_TYPE_ZH = {
    "RUMOR": "含有不實訊息",
    "NOT_RUMOR": "含有正確訊息",
    "OPINIONATED": "含有個人意見",
    "NOT_ARTICLE": "不在查證範圍",
}
STATUS_ZH = {
    "found": "找到相關查核資料",
    "not_found": "尚無查核資料",
    "error": "查詢失敗",
    "not_configured": "Demo 模式：尚未設定 Cofacts 憑證，未進行查詢（尚無查核資料）",
    "rate_limited": "今日查詢次數已達上限，暫停外部查詢",
    "skipped": "未查詢（使用者選擇不送出或沒有可查詢文字）",
}

QUERY = """
query($text: String!) {
  ListArticles(
    filter: { moreLikeThis: { like: $text, minimumShouldMatch: "0" } }
    orderBy: [{ _score: DESC }]
    first: 3
  ) {
    edges {
      score
      node {
        id
        text
        articleReplies(status: NORMAL) { reply { id type text } }
      }
    }
  }
}
"""


@dataclass
class SourceMatch:
    match_type: str  # exact / similar
    title: str
    url: str
    reply_type: str | None
    reply_type_zh: str
    reply_excerpt: str | None
    similarity: float


@dataclass
class SourceLookup:
    provider: str
    status: str
    mode: str  # live / mock
    matches: list[SourceMatch] = field(default_factory=list)
    message: str = ""
    license_tag: str = LICENSE

    def __post_init__(self):
        self.message = self.message or STATUS_ZH.get(self.status, self.status)


def _canon(text: str) -> str:
    return re.sub(r"[\W_]+", "", text or "").lower()


class _DailyCounter:
    def __init__(self):
        self._day, self._n, self._lock = date.today(), 0, threading.Lock()

    def take(self, limit: int) -> bool:
        with self._lock:
            if date.today() != self._day:
                self._day, self._n = date.today(), 0
            if self._n >= limit:
                return False
            self._n += 1
            return True


_counter = _DailyCounter()


class MockCofactsAdapter:
    """沒有憑證時使用。刻意不回傳任何假的查核紀錄。"""
    mode = "mock"

    def lookup(self, text: str) -> SourceLookup:
        return SourceLookup("cofacts", "not_configured", self.mode)


class CofactsAdapter:
    mode = "live"

    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.s = settings
        self.transport = transport

    def _post(self, text: str) -> dict:
        headers = {"x-app-id": self.s.cofacts_app_id, "x-app-secret": self.s.cofacts_app_secret}
        last_exc: Exception | None = None
        for attempt in range(self.s.cofacts_max_retries + 1):
            try:
                with httpx.Client(timeout=self.s.cofacts_timeout_seconds, transport=self.transport) as client:
                    r = client.post(self.s.cofacts_api_url, json={"query": QUERY, "variables": {"text": text[:2000]}}, headers=headers)
                if r.status_code >= 500:
                    raise httpx.HTTPStatusError("server error", request=r.request, response=r)
                r.raise_for_status()
                data = r.json()
                if data.get("errors"):
                    raise ValueError("GraphQL error")
                return data
            except (httpx.TransportError, httpx.HTTPStatusError, ValueError) as exc:
                last_exc = exc
                is_client_error = isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code < 500
                if is_client_error or attempt >= self.s.cofacts_max_retries:
                    break
                time.sleep(0.4 * (attempt + 1))
        raise RuntimeError("cofacts request failed") from last_exc

    def lookup(self, text: str) -> SourceLookup:
        if not _counter.take(self.s.cofacts_daily_limit):
            return SourceLookup("cofacts", "rate_limited", self.mode)
        try:
            data = self._post(text)
            edges = (((data.get("data") or {}).get("ListArticles") or {}).get("edges")) or []
        except Exception:
            return SourceLookup("cofacts", "error", self.mode, message="Cofacts 查詢失敗或逾時，其他分析仍正常進行。")

        matches: list[SourceMatch] = []
        target = _canon(text)[:600]
        for edge in edges:
            node = edge.get("node") or {}
            art_text = str(node.get("text") or "")
            ratio = difflib.SequenceMatcher(None, target, _canon(art_text)[:600]).ratio()
            if ratio < 0.4:  # 關聯太低不列入，避免誤導
                continue
            replies = [ar.get("reply") or {} for ar in (node.get("articleReplies") or [])]
            first = replies[0] if replies else {}
            rtype = first.get("type")
            matches.append(SourceMatch(
                match_type="exact" if ratio >= 0.95 else "similar",
                title=art_text[:80],
                url=ARTICLE_URL.format(id=str(node.get("id", ""))),
                reply_type=rtype,
                reply_type_zh=REPLY_TYPE_ZH.get(rtype, "尚無查核回覆"),
                reply_excerpt=(str(first.get("text"))[:200] if first.get("text") else None),
                similarity=round(ratio, 2),
            ))
        return SourceLookup("cofacts", "found" if matches else "not_found", self.mode, matches)


def get_cofacts_adapter(settings: Settings):
    return CofactsAdapter(settings) if settings.cofacts_live else MockCofactsAdapter()
