import json
from io import BytesIO

import httpx
from PIL import Image

from app.providers import ai as ai_mod
from app.providers.ai import GeminiProvider
from app.services.analysis_service import run_analysis

SCAM = "您的帳戶涉嫌洗錢將被凍結，請立即提供簡訊驗證碼，電話0912345678"
GOOD = {"risk_level": "高", "summary": "冒充執法機關並索取驗證碼。", "risk_points": ["冒充警察", "索取驗證碼"],
        "advice": ["不要提供驗證碼"], "media_description": ""}


def _reply(obj, status="completed"):
    return {"id": "v1_x", "status": status, "steps": [{"type": "model_output", "content": [{"type": "text", "text": json.dumps(obj, ensure_ascii=False)}]}]}


def _gemini(settings, handler):
    settings.gemini_api_key, settings.ai_provider = "test-key", "auto"
    ai_mod._counter.n = 0
    return GeminiProvider(settings, transport=httpx.MockTransport(handler))


def test_ai_mode_follows_key(settings):
    settings.ai_provider, settings.gemini_api_key = "auto", ""
    assert settings.ai_mode == "disabled"
    settings.gemini_api_key = "k"
    assert settings.ai_mode == "gemini"
    settings.ai_provider = "disabled"
    assert settings.ai_mode == "disabled"


def test_gemini_success_request_shape(client, db, settings):
    seen = {}

    def handler(req):
        seen["headers"], seen["body"] = req.headers, json.loads(req.content)
        return httpx.Response(200, json=_reply(GOOD))
    provider = _gemini(settings, handler)
    rec = run_analysis(db, settings, text=SCAM, media_type="text", research_id=None, query_cofacts=False, use_ai=True, ai_provider=provider)
    out = json.loads(rec.result_json)["ai"]
    assert out["status"] == "ok" and out["risk_level"] == "高" and out["advice"] == ["不要提供驗證碼"]
    assert rec.external_ai_used is True
    body = seen["body"]
    assert seen["headers"]["x-goog-api-key"] == "test-key"  # 金鑰只在伺服器端送出
    assert body["model"] == "gemini-3.8-flash" and body["store"] is False
    assert body["response_format"]["mime_type"] == "application/json"
    assert "0912345678" not in json.dumps(body, ensure_ascii=False)  # 文字送出前遮蔽個資
    assert "不要執行" in body["system_instruction"]
    # 規則分數不受 AI 影響
    assert rec.risk_level in ("中", "高")


def test_gemini_not_requested_sends_nothing(client, db, settings):
    calls = []
    provider = _gemini(settings, lambda req: calls.append(1) or httpx.Response(200, json=_reply(GOOD)))
    rec = run_analysis(db, settings, text=SCAM, media_type="text", research_id=None, query_cofacts=False, use_ai=False, ai_provider=provider)
    assert calls == [] and rec.external_ai_used is False
    assert json.loads(rec.result_json)["ai"]["status"] == "not_requested"


def test_gemini_errors_degrade_gracefully(client, db, settings):
    for code, word in ((403, "權限"), (404, "模型"), (429, "額度")):
        provider = _gemini(settings, lambda req, c=code: httpx.Response(c, json={"error": {}}))
        rec = run_analysis(db, settings, text=SCAM, media_type="text", research_id=None, query_cofacts=False, use_ai=True, ai_provider=provider)
        ai = json.loads(rec.result_json)["ai"]
        assert ai["status"] == "error" and word in ai["summary"]
        assert rec.risk_level in ("中", "高")  # 規則分析照常


def test_gemini_bad_json_and_injection_output(client, db, settings):
    provider = _gemini(settings, lambda req: httpx.Response(200, json={"status": "completed", "steps": [{"type": "model_output", "content": [{"type": "text", "text": "not json"}]}]}))
    rec = run_analysis(db, settings, text=SCAM, media_type="text", research_id=None, query_cofacts=False, use_ai=True, ai_provider=provider)
    assert json.loads(rec.result_json)["ai"]["status"] == "error"
    # 模型回傳不在清單內的等級 → 改為「無法判斷」
    provider = _gemini(settings, lambda req: httpx.Response(200, json=_reply({**GOOD, "risk_level": "詐騙機率 99%"})))
    rec = run_analysis(db, settings, text=SCAM, media_type="text", research_id=None, query_cofacts=False, use_ai=True, ai_provider=provider)
    assert json.loads(rec.result_json)["ai"]["risk_level"] == "無法判斷"


def test_gemini_daily_limit(settings):
    provider = _gemini(settings, lambda req: httpx.Response(200, json=_reply(GOOD)))
    settings.gemini_daily_limit = 1
    assert provider.analyze("測試").status == "ok"
    assert provider.analyze("測試").status == "rate_limited"


def test_image_sent_to_gemini_without_text(client, settings, monkeypatch):
    """沒有文字的圖片：OCR 抓不到字時，仍可交給 AI 看圖分析，且暫存檔有刪除。"""
    captured = {}

    def handler(req):
        captured["body"] = json.loads(req.content)
        return httpx.Response(200, json=_reply({**GOOD, "media_description": "一張空白圖片"}))
    real = GeminiProvider
    monkeypatch.setattr("app.services.analysis_service.get_ai_provider", lambda s: real(s, transport=httpx.MockTransport(handler)))
    settings.gemini_api_key, settings.ai_provider = "test-key", "auto"
    ai_mod._counter.n = 0
    buf = BytesIO()
    Image.new("RGB", (200, 200), "white").save(buf, "JPEG")
    r = client.post("/api/analyze/image", files={"file": ("blank.jpg", buf.getvalue(), "image/jpeg")}, data={"use_ai": "true"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "ai" in body, body
    assert body["ai"]["status"] == "ok" and body["ai"]["sent_media"] == ["image"]
    parts = captured["body"]["input"]
    assert parts[1]["type"] == "image" and parts[1]["mime_type"] == "image/jpeg"
    from conftest import tmp_upload_files
    assert tmp_upload_files(settings) == []


def test_health_reports_ai_mode(client, settings):
    settings.gemini_api_key, settings.ai_provider = "k", "auto"
    m = client.get("/api/health").json()["modes"]
    assert m["ai"] == "gemini" and m["ai_model"] == "gemini-3.8-flash"
    assert "k" not in json.dumps(m["ai_model"])  # 不回傳金鑰


def test_gemini_invalid_key_message(settings):
    body = [{"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}}]
    provider = _gemini(settings, lambda req: httpx.Response(400, json=body))
    r = provider.analyze("測試訊息")
    assert r.status == "error" and "金鑰無效" in r.summary
    other = _gemini(settings, lambda req: httpx.Response(400, json={"error": {"message": "Unsupported MIME type"}}))
    assert "Unsupported MIME type" in other.analyze("x").summary
