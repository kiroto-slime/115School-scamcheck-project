from datetime import datetime
import json
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings, save_config_values
from ..database import get_db
from ..export import build_workbook
from ..models import AnalysisRecord, AuditLog, BusinessEvent, PatternDataset, ResearchCase, ResearchResponse
from ..schemas import BusinessEventIn, CaseIn, LoginIn, PatternReviewIn, ResearcherCategoryIn, ReviewIn, SetupIn
from ..security import create_token, hash_password, is_local_request, rate_limit, require_admin, verify_password
from ..services.demo import clear_demo, seed_demo
from ..services.statistics import compute_statistics

router = APIRouter(prefix="/api/admin", tags=["admin"])
Dataset = Query("formal", pattern="^(formal|demo)$")


def _log(db: Session, actor: str, action: str, target: str | None = None, detail: str | None = None):
    db.add(AuditLog(actor=actor, action=action, target=target, detail=detail))


def _is_local(request: Request) -> bool:
    return is_local_request(request)


@router.get("/setup-status")
def setup_status(request: Request, settings: Settings = Depends(get_settings)):
    return {"configured": settings.admin_enabled, "setup_allowed": not settings.admin_enabled and _is_local(request)}


@router.post("/setup", dependencies=[Depends(rate_limit("login"))])
def first_setup(body: SetupIn, request: Request, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    """首次使用：在執行程式的這台電腦上設定管理員帳密（只存雜湊值於 data/config.env）。"""
    if settings.admin_enabled:
        raise HTTPException(409, "管理員已設定過。若忘記密碼，請參考使用說明重設。")
    if not _is_local(request):
        raise HTTPException(403, "基於安全，只能在執行程式的這台電腦上（網址 127.0.0.1）完成首次設定。")
    values = {"ADMIN_USERNAME": body.username, "ADMIN_PASSWORD_HASH": hash_password(body.password), "SECRET_KEY": secrets.token_urlsafe(32)}
    save_config_values(values)
    settings.admin_username, settings.admin_password_hash, settings.secret_key = values["ADMIN_USERNAME"], values["ADMIN_PASSWORD_HASH"], values["SECRET_KEY"]
    _log(db, body.username, "admin_setup")
    db.commit()
    return {"token": create_token(body.username, settings), "expires_minutes": settings.admin_token_minutes}


@router.post("/login", dependencies=[Depends(rate_limit("login"))])
def login(body: LoginIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    if not settings.admin_enabled:
        raise HTTPException(503, "管理員功能尚未設定，請依 README 設定 ADMIN_PASSWORD_HASH 與 SECRET_KEY。")
    if body.username != settings.admin_username or not verify_password(body.password, settings.admin_password_hash):
        _log(db, "unknown", "login_failed")
        db.commit()
        raise HTTPException(401, "帳號或密碼錯誤。")
    _log(db, body.username, "login")
    db.commit()
    return {"token": create_token(body.username, settings), "expires_minutes": settings.admin_token_minutes}


@router.get("/statistics")
def statistics(dataset: str = Dataset, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    return compute_statistics(db, dataset == "demo")


@router.get("/export.xlsx")
def export(dataset: str = Dataset, db: Session = Depends(get_db), user: str = Depends(require_admin)):
    data = build_workbook(db, dataset == "demo")
    _log(db, user, "export", dataset)
    db.commit()
    name = f"research_{dataset}_{datetime.now():%Y%m%d_%H%M}.xlsx"
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/analysis-records")
def analysis_records(dataset: str = Dataset, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    rows = db.scalars(select(AnalysisRecord).where(AnalysisRecord.is_demo == (dataset == "demo"), AnalysisRecord.consent_research.is_(True))
                      .order_by(AnalysisRecord.created_at.desc()).limit(200))
    return [{"analysis_id": a.analysis_id, "research_id": a.research_id_nullable, "created_at": a.created_at.isoformat(), "media_type": a.media_type,
             "risk_level": a.risk_level, "risk_score": a.risk_score_nullable, "risk_tags": json.loads(a.risk_tags_json)} for a in rows]


@router.get("/responses")
def responses(dataset: str = Dataset, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    rows = db.scalars(select(ResearchResponse).where(ResearchResponse.is_demo == (dataset == "demo"))
                      .order_by(ResearchResponse.created_at.desc()).limit(200))
    return [{"response_id": r.response_id, "research_id": r.research_id, "group": r.experiment_group, "phase": r.phase,
             "user_decision": r.user_decision, "decision_reason_code": r.decision_reason_code, "correctness": r.correctness,
             "error_type": r.error_type, "researcher_category": r.researcher_category, "created_at": r.created_at.isoformat()} for r in rows]


@router.patch("/responses/{response_id}")
def set_researcher_category(response_id: str, body: ResearcherCategoryIn, db: Session = Depends(get_db), user: str = Depends(require_admin)):
    r = db.get(ResearchResponse, response_id)
    if not r:
        raise HTTPException(404, "找不到作答紀錄。")
    r.researcher_category = body.researcher_category
    _log(db, user, "update_researcher_category", response_id, str(body.researcher_category))
    db.commit()
    return {"updated": True}


@router.get("/cases")
def list_cases(db: Session = Depends(get_db), _: str = Depends(require_admin)):
    return [{k: getattr(c, k) for k in ("case_id", "case_version", "title", "simulated_content", "verified_label", "label_basis",
                                        "difficulty", "category", "reviewer_status")} for c in db.scalars(select(ResearchCase))]


@router.post("/cases")
def create_case(body: CaseIn, db: Session = Depends(get_db), user: str = Depends(require_admin)):
    c = ResearchCase(**body.model_dump(), reviewer_status="pending")
    db.add(c)
    db.flush()
    _log(db, user, "create_case", c.case_id)
    db.commit()
    return {"case_id": c.case_id}


@router.patch("/cases/{case_id}")
def review_case(case_id: str, body: ReviewIn, db: Session = Depends(get_db), user: str = Depends(require_admin)):
    c = db.get(ResearchCase, case_id)
    if not c:
        raise HTTPException(404, "找不到案例。")
    c.reviewer_status = body.status
    _log(db, user, "review_case", case_id, body.status)
    db.commit()
    return {"updated": True}


@router.get("/patterns")
def list_patterns(db: Session = Depends(get_db), _: str = Depends(require_admin)):
    return [{k: getattr(p, k) for k in ("pattern_id", "scam_category", "psychological_trigger", "risk_indicators", "prevention_method",
                                        "verification_status", "evidence_source", "source_license", "human_review_status", "dataset_version")}
            for p in db.scalars(select(PatternDataset))]


@router.patch("/patterns/{pattern_id}")
def review_pattern(pattern_id: str, body: PatternReviewIn, db: Session = Depends(get_db), user: str = Depends(require_admin)):
    p = db.get(PatternDataset, pattern_id)
    if not p:
        raise HTTPException(404, "找不到風險模式。")
    p.human_review_status = body.human_review_status
    if body.verification_status:
        p.verification_status = body.verification_status
    _log(db, user, "review_pattern", pattern_id, body.human_review_status)
    db.commit()
    return {"updated": True}


@router.post("/business-events")
def add_business_event(body: BusinessEventIn, db: Session = Depends(get_db), user: str = Depends(require_admin),
                       settings: Settings = Depends(get_settings)):
    db.add(BusinessEvent(**body.model_dump(), is_demo=not settings.research_is_formal))
    _log(db, user, "business_event", body.event_type)
    db.commit()
    return {"recorded": True}


@router.post("/demo/seed")
def demo_seed(db: Session = Depends(get_db), user: str = Depends(require_admin)):
    out = seed_demo(db)
    _log(db, user, "demo_seed", detail=str(out))
    db.commit()
    return out


@router.post("/demo/clear")
def demo_clear(db: Session = Depends(get_db), user: str = Depends(require_admin)):
    out = clear_demo(db)
    _log(db, user, "demo_clear", detail=str(out)[:300])
    db.commit()
    return out


@router.post("/ai/test")
def ai_test(db: Session = Depends(get_db), user: str = Depends(require_admin), settings: Settings = Depends(get_settings)):
    """用很短的訊息測試 Gemini 金鑰與模型名稱是否正確。"""
    from ..providers.ai import GeminiProvider
    if settings.ai_mode != "gemini":
        return {"ok": False, "model": settings.gemini_model, "message": "尚未設定 GEMINI_API_KEY（或 AI_PROVIDER 設為 disabled）。"}
    out = GeminiProvider(settings).test_connection()
    _log(db, user, "ai_test", settings.gemini_model, "ok" if out["ok"] else "failed")
    db.commit()
    return out


@router.get("/audit-logs")
def audit_logs(db: Session = Depends(get_db), _: str = Depends(require_admin)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(100))
    return [{"actor": a.actor, "action": a.action, "target": a.target, "detail": a.detail, "created_at": a.created_at.isoformat()} for a in rows]
