import json

import httpx

from app.models import AnalysisRecord
from app.providers.cofacts import CofactsAdapter
from app.services.analysis_service import purge_expired, run_analysis
from app.services.risk_analyzer import analyze_text, redact_pii

SCAM = "【物流通知】您的包裹地址錯誤，請於24小時內點擊 https://bit.ly/abc 更新資料並支付手續費，逾期將退回。"


def test_text_analysis_works(client, db):
    r = client.post("/api/analyze/text", json={"text": SCAM})
    assert r.status_code == 200
    body = r.json()
    assert body["risk_level"] in ("中", "高")
    assert 0 <= body["risk_score"] <= 100
    ids = {f["feature_id"] for f in body["features"]}
    assert {"urgency", "suspicious_link", "financial_request"} <= ids
    assert all(f["rule_version"] and f["human_verified"] is False for f in body["features"])
    assert "機率" in body["score_disclaimer"] and body["safe_actions"]
    # 可再次讀取結果，但資料庫不保存原文
    assert client.get(f"/api/analysis/{body['analysis_id']}").status_code == 200
    rec = db.get(AnalysisRecord, body["analysis_id"])
    assert "包裹地址錯誤" not in rec.result_json and "bit.ly/abc" not in rec.result_json


def test_no_features_is_insufficient_not_safe():
    r = analyze_text("明天下午三點社團開會，記得帶筆電喔")
    assert r.risk_level == "資訊不足"
    assert analyze_text("你好").risk_score is None


def test_text_too_long_rejected(client):
    assert client.post("/api/analyze/text", json={"text": "a" * 10_001}).status_code == 422


def test_mock_mode_without_keys(client):
    modes = client.get("/api/health").json()["modes"]
    assert modes["cofacts"] == "mock" and modes["ai"] == "disabled"
    body = client.post("/api/analyze/text", json={"text": SCAM}).json()
    assert body["cofacts"]["status"] == "not_configured"
    assert body["cofacts"]["matches"] == []  # 不產生虛構查核回覆
    assert "尚無查核資料" in body["cofacts"]["message"]
    assert body["ai"]["status"] == "disabled" and body["external_ai_used"] is False


def _adapter(settings, handler):
    settings.cofacts_app_id, settings.cofacts_app_secret, settings.cofacts_max_retries = "id", "secret", 1
    return CofactsAdapter(settings, transport=httpx.MockTransport(handler))


def test_cofacts_not_found(client, db, settings):
    adapter = _adapter(settings, lambda req: httpx.Response(200, json={"data": {"ListArticles": {"edges": []}}}))
    rec = run_analysis(db, settings, text=SCAM, media_type="text", research_id=None, query_cofacts=True, cofacts_adapter=adapter)
    data = json.loads(rec.result_json)
    assert data["cofacts"]["status"] == "not_found" and data["cofacts"]["message"] == "尚無查核資料"
    assert rec.risk_level in ("中", "高")  # 查無資料不等於安全


def test_cofacts_error_degrades_gracefully(client, db, settings):
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(500)
    rec = run_analysis(db, settings, text=SCAM, media_type="text", research_id=None, query_cofacts=True, cofacts_adapter=_adapter(settings, handler))
    assert len(calls) == 2  # 重試一次
    assert rec.analysis_status == "completed_with_source_error"
    assert json.loads(rec.result_json)["cofacts"]["status"] == "error"
    assert rec.risk_level in ("中", "高")


def test_cofacts_timeout(client, db, settings):
    def handler(req):
        raise httpx.ConnectTimeout("timeout")
    rec = run_analysis(db, settings, text=SCAM, media_type="text", research_id=None, query_cofacts=True, cofacts_adapter=_adapter(settings, handler))
    assert json.loads(rec.result_json)["cofacts"]["status"] == "error"


def test_cofacts_similar_match_and_pii_redacted(client, db, settings):
    seen = {}

    def handler(req):
        seen["body"] = req.content.decode()
        node = {"id": "abc123", "text": SCAM, "articleReplies": [{"reply": {"id": "r1", "type": "RUMOR", "text": "這是詐騙簡訊"}}]}
        return httpx.Response(200, json={"data": {"ListArticles": {"edges": [{"score": 9, "node": node}]}}})
    rec = run_analysis(db, settings, text=SCAM + " 電話0912345678", media_type="text", research_id=None, query_cofacts=True,
                       cofacts_adapter=_adapter(settings, handler))
    m = json.loads(rec.result_json)["cofacts"]["matches"][0]
    assert m["url"] == "https://cofacts.tw/article/abc123" and m["reply_type"] == "RUMOR"
    assert m["match_type"] in ("exact", "similar")
    assert "0912345678" not in seen["body"] and rec.sources[0].license_tag == "CC BY-SA 4.0"


def test_redact_pii():
    out = redact_pii("電話0912345678身分證A123456789信箱a.b@test.com帳號12345678901234")
    assert "0912345678" not in out and "A123456789" not in out and "a.b@test.com" not in out and "12345678901234" not in out
    assert out.startswith("電話[手機]")


def test_unconsented_analysis_expires(client, db, settings):
    body = client.post("/api/analyze/text", json={"text": SCAM}).json()
    rec = db.get(AnalysisRecord, body["analysis_id"])
    assert rec.consent_research is False and rec.research_id_nullable is None and rec.expires_at is not None
    settings.temp_analysis_retention_hours = -1
    client.post("/api/analyze/text", json={"text": SCAM})
    assert purge_expired(db, settings) >= 1


def test_rate_limit(client, settings):
    settings.rate_limit_analyze_per_minute = 2
    codes = [client.post("/api/analyze/text", json={"text": "測試訊息內容一二三四五六"}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
