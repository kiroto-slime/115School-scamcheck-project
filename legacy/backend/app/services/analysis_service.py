"""串接各分析模組：Cofacts → 規則分析 → （可選）AI → 綜合結果。外部來源失敗時其他功能照常。"""
from __future__ import annotations

from datetime import timedelta
import json

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import AnalysisRecord, AuditLog, ConsentRecord, SourceResult, utcnow
from ..providers.ai import NotRequestedProvider, get_ai_provider
from ..providers.cofacts import LICENSE, get_cofacts_adapter
from .risk_analyzer import analyze_text, redact_pii


def has_active_consent(db: Session, research_id: str | None, purpose: str) -> bool:
    if not research_id:
        return False
    row = db.scalars(select(ConsentRecord).where(ConsentRecord.research_id == research_id, ConsentRecord.purpose == purpose)
                     .order_by(ConsentRecord.consent_time.desc())).first()
    return bool(row and row.consent_status == "granted")


def run_analysis(db: Session, settings: Settings, *, text: str, media_type: str, research_id: str | None,
                 query_cofacts: bool, media_info: dict | None = None, cofacts_adapter=None,
                 use_ai: bool = False, ai_media: list | None = None, ai_provider=None) -> AnalysisRecord:
    consent_research = has_active_consent(db, research_id, "research") and settings.research_collection_enabled
    consent_secondary = consent_research and has_active_consent(db, research_id, "secondary_use")

    # 1. Cofacts：只送出遮蔽個資後的文字
    adapter = cofacts_adapter or get_cofacts_adapter(settings)
    if query_cofacts and text.strip():
        lookup = adapter.lookup(redact_pii(text))
    else:
        from ..providers.cofacts import SourceLookup
        lookup = SourceLookup("cofacts", "skipped", adapter.mode)

    # 2. 規則分析
    signals = [{"reply_type": m.reply_type, "match_type": m.match_type} for m in lookup.matches]
    risk = analyze_text(text, signals)

    # 3. AI（Gemini）：只有使用者勾選時才送出；文字先遮蔽個資
    provider = ai_provider or get_ai_provider(settings)
    if provider.name == "gemini" and not use_ai:
        provider = NotRequestedProvider()
    ai = provider.analyze(redact_pii(text), ai_media or [])

    now = utcnow()
    result = {
        "media": media_info or {},
        "cofacts": {
            "status": lookup.status, "mode": lookup.mode, "message": lookup.message, "license": LICENSE,
            "matches": [m.__dict__ for m in lookup.matches],
        },
        "features": [f.to_dict() for f in risk.features],
        "basis": risk.basis,
        "safe_actions": risk.safe_actions,
        "ai": ai.__dict__,
        "checked_at": now.isoformat() + "Z",
    }
    status = "completed" if lookup.status != "error" and ai.status != "error" else "completed_with_source_error"
    rec = AnalysisRecord(
        research_id_nullable=research_id if consent_research else None,
        media_type=media_type,
        source_count=len(lookup.matches),
        risk_score_nullable=risk.risk_score,
        risk_level=risk.risk_level,
        risk_tags_json=json.dumps(risk.tags),
        analysis_status=status,
        rule_version=risk.rule_version,
        external_ai_used=ai.external,
        consent_research=consent_research,
        consent_secondary_use=consent_secondary,
        is_demo=not settings.research_is_formal,
        result_json=json.dumps(result, ensure_ascii=False),
        # 未同意研究者：只暫存供當次查看結果，到期自動刪除
        expires_at=None if consent_research else now + timedelta(hours=settings.temp_analysis_retention_hours),
    )
    db.add(rec)
    db.flush()
    if lookup.matches:
        for m in lookup.matches:
            db.add(SourceResult(analysis_id=rec.analysis_id, provider="cofacts", result_status=lookup.status, match_type=m.match_type,
                                source_title=m.title, source_url=m.url, reply_type=m.reply_type, checked_at=now, license_tag=LICENSE))
    else:
        db.add(SourceResult(analysis_id=rec.analysis_id, provider="cofacts", result_status=lookup.status, match_type="none",
                            checked_at=now, license_tag=LICENSE if lookup.status == "not_found" else None))
    db.commit()
    return rec


def serialize(rec: AnalysisRecord) -> dict:
    data = json.loads(rec.result_json or "{}")
    return {
        "analysis_id": rec.analysis_id,
        "created_at": rec.created_at.isoformat() + "Z",
        "media_type": rec.media_type,
        "risk_level": rec.risk_level,
        "risk_score": rec.risk_score_nullable,
        "risk_tags": json.loads(rec.risk_tags_json),
        "analysis_status": rec.analysis_status,
        "rule_version": rec.rule_version,
        "external_ai_used": rec.external_ai_used,
        "consent_research": rec.consent_research,
        "score_disclaimer": "風險指數為規則加權分數，不是經統計校準的詐騙機率，也不是司法認定。",
        **data,
    }


def get_record(db: Session, analysis_id: str) -> AnalysisRecord:
    rec = db.get(AnalysisRecord, analysis_id)
    if not rec or (rec.expires_at and rec.expires_at < utcnow()):
        raise HTTPException(404, "找不到這筆分析結果，可能已超過暫存期限而自動刪除。")
    return rec


def purge_expired(db: Session, settings: Settings) -> int:
    now = utcnow()
    n = db.execute(delete(AnalysisRecord).where(AnalysisRecord.expires_at.is_not(None), AnalysisRecord.expires_at < now)).rowcount
    cutoff = now - timedelta(days=settings.research_retention_days)
    n += db.execute(delete(AnalysisRecord).where(AnalysisRecord.created_at < cutoff)).rowcount
    if n:
        db.add(AuditLog(actor="system", action="retention_purge", detail=f"刪除 {n} 筆過期分析紀錄"))
    db.commit()
    return n
