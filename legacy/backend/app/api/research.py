import json
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db
from ..models import ConsentRecord, ResearchCase, ResearchParticipant, ResearchResponse
from ..research import ASSISTANCE_BY_GROUP, assign_group, build_assistance, eligible_cases, pick_case_pair
from ..schemas import ResearchAnswerIn, ResearchIdIn, ResearchStartIn
from ..security import rate_limit
from ..services.analysis_service import has_active_consent
from ..services.risk_analyzer import analyze_text

router = APIRouter(prefix="/api/research", tags=["research"], dependencies=[Depends(rate_limit("default"))])
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去除易混淆字元


def new_research_id() -> str:
    return "R" + "".join(secrets.choice(ALPHABET) for _ in range(12))


def _public_case(c: ResearchCase, phase: str) -> dict:
    # 不回傳正確答案，避免作答前看到
    return {"case_id": c.case_id, "title": c.title, "simulated_content": c.simulated_content, "phase": phase,
            "reviewer_status": c.reviewer_status}


def _participant(db: Session, rid: str) -> ResearchParticipant:
    p = db.get(ResearchParticipant, rid)
    if not p or p.status in ("withdrawn", "deleted"):
        raise HTTPException(404, "找不到研究編號，或已撤回參與。")
    if not has_active_consent(db, rid, "research"):
        raise HTTPException(403, "研究同意已撤回，不再蒐集資料。")
    return p


@router.post("/start")
def start(body: ResearchStartIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    if not settings.research_collection_enabled:
        raise HTTPException(403, "研究資料蒐集已結束，感謝參與。基本查核服務仍可使用。")
    if not body.consent_research:
        # 拒絕研究同意：不建立任何紀錄，也不影響查核服務
        raise HTTPException(400, "未同意研究資料蒐集，因此無法進入研究測驗；基本查核服務不受影響。")
    formal = settings.research_is_formal
    pair = pick_case_pair(eligible_cases(db, formal))
    if not pair:
        raise HTTPException(503, "目前沒有足夠的已審核研究案例（需要至少兩題相同難度）。")
    rid = new_research_id()
    is_demo = not formal
    group = assign_group(db, settings.research_group_mode, is_demo)
    db.add(ResearchParticipant(research_id=rid, experiment_group=group, pre_case_id=pair[0].case_id, post_case_id=pair[1].case_id, is_demo=is_demo))
    db.add(ConsentRecord(research_id=rid, purpose="research", consent_version=settings.consent_version, consent_status="granted", is_demo=is_demo))
    db.add(ConsentRecord(research_id=rid, purpose="secondary_use", consent_version=settings.consent_version,
                         consent_status="granted" if body.consent_secondary else "declined", is_demo=is_demo))
    db.commit()
    warnings = []
    if is_demo:
        warnings.append("目前為模擬研究模式（DEMO），資料不列入正式研究。")
    if any(c.reviewer_status != "approved" for c in pair):
        warnings.append("部分案例尚未完成人工審核，僅供系統測試。")
    return {"research_id": rid, "is_demo": is_demo, "pre_case": _public_case(pair[0], "pre"),
            "post_case": _public_case(pair[1], "post"), "warnings": warnings}


@router.post("/assistance")
def assistance(body: ResearchIdIn, db: Session = Depends(get_db)):
    p = _participant(db, body.research_id)
    answered = {r.phase for r in db.scalars(select(ResearchResponse).where(ResearchResponse.research_id == p.research_id))}
    if "post_initial" not in answered:
        raise HTTPException(409, "請先完成後測案例的初步判斷，再查看輔助資訊。")
    return build_assistance(p.experiment_group, db.get(ResearchCase, p.post_case_id))


@router.post("/answer")
def answer(body: ResearchAnswerIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    if not settings.research_collection_enabled:
        raise HTTPException(403, "研究資料蒐集已結束。")
    p = _participant(db, body.research_id)
    expected = p.pre_case_id if body.phase == "pre" else p.post_case_id
    if body.case_id != expected:
        raise HTTPException(400, "案例與作答階段不符。")
    existing = {r.phase for r in db.scalars(select(ResearchResponse).where(ResearchResponse.research_id == p.research_id))}
    order = ["pre", "post_initial", "post_assisted"]
    if body.phase in existing:
        raise HTTPException(409, "此階段已作答。")
    if any(ph not in existing for ph in order[: order.index(body.phase)]):
        raise HTTPException(409, "請依序完成前面的階段。")

    case = db.get(ResearchCase, body.case_id)
    if body.user_decision == "unsure":
        correct, err = None, "unsure"
    else:
        correct = body.user_decision == case.verified_label
        err = None if correct else ("false_positive" if case.verified_label == "legit" else "false_negative")
    assisted = body.phase == "post_assisted"
    triggers = analyze_text(case.simulated_content).tags if assisted and p.experiment_group == "B" else []
    db.add(ResearchResponse(research_id=p.research_id, experiment_group=p.experiment_group, case_id=case.case_id, phase=body.phase,
                            user_decision=body.user_decision, decision_reason_code=body.decision_reason_code, correctness=correct,
                            error_type=err, response_time_ms=body.response_time_ms,
                            assistance_used=ASSISTANCE_BY_GROUP[p.experiment_group] if assisted else "none",
                            system_triggers_json=json.dumps(triggers), is_demo=p.is_demo))
    result = {"recorded": True, "phase": body.phase}
    if assisted:
        p.status = "completed"
        result["reveal"] = [
            {"case_id": c.case_id, "title": c.title, "verified_label": c.verified_label, "label_basis": c.label_basis}
            for c in (db.get(ResearchCase, p.pre_case_id), case)
        ]
    db.commit()
    return result
