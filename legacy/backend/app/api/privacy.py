from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db
from ..models import (AnalysisRecord, AuditLog, ConsentRecord, FeedbackRecord, ProductSurveyResponse, ResearchParticipant,
                      ResearchResponse, utcnow)
from ..schemas import ConsentIn, FeedbackIn, ResearchIdIn, SurveyIn
from ..security import rate_limit
from .research import new_research_id

router = APIRouter(prefix="/api", tags=["privacy"], dependencies=[Depends(rate_limit("default"))])


@router.post("/consent")
def consent(body: ConsentIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    is_demo = not settings.research_is_formal
    rid = body.research_id
    if body.status == "withdrawn":
        if not rid:
            raise HTTPException(400, "撤回同意需要提供研究編號。")
        purposes = ["research", "secondary_use"] if body.purpose == "research" else [body.purpose]
        n = db.execute(update(ConsentRecord).where(ConsentRecord.research_id == rid, ConsentRecord.purpose.in_(purposes),
                                                   ConsentRecord.consent_status == "granted")
                       .values(consent_status="withdrawn", withdrawal_time=utcnow())).rowcount
        if not n:
            raise HTTPException(404, "找不到有效的同意紀錄。")
        if body.purpose == "research":
            db.execute(update(ResearchParticipant).where(ResearchParticipant.research_id == rid).values(status="withdrawn"))
        db.commit()
        return {"research_id": rid, "purpose": body.purpose, "status": "withdrawn",
                "message": "已撤回同意，之後不再蒐集研究資料。若要刪除已蒐集資料，請使用「刪除我的研究資料」。"}

    if body.status == "granted" and not settings.research_collection_enabled:
        raise HTTPException(403, "研究資料蒐集已結束。")
    if not rid:
        if body.status != "granted" or body.purpose != "research":
            return {"research_id": None, "purpose": body.purpose, "status": body.status, "message": "未建立任何研究紀錄。"}
        rid = new_research_id()
    elif body.purpose == "secondary_use" and body.status == "granted" and not db.scalars(
            select(ConsentRecord).where(ConsentRecord.research_id == rid, ConsentRecord.purpose == "research",
                                        ConsentRecord.consent_status == "granted")).first():
        raise HTTPException(400, "需先同意研究用途，才能同意衍生統計使用。")
    db.add(ConsentRecord(research_id=rid, purpose=body.purpose, consent_version=settings.consent_version, consent_status=body.status, is_demo=is_demo))
    db.commit()
    return {"research_id": rid, "purpose": body.purpose, "status": body.status, "consent_version": settings.consent_version}


@router.post("/privacy/delete")
def delete_my_data(body: ResearchIdIn, db: Session = Depends(get_db)):
    rid = body.research_id
    counts = {
        "research_responses": db.execute(delete(ResearchResponse).where(ResearchResponse.research_id == rid)).rowcount,
        "analysis_records": db.execute(delete(AnalysisRecord).where(AnalysisRecord.research_id_nullable == rid)).rowcount,
        "feedback": db.execute(delete(FeedbackRecord).where(FeedbackRecord.research_id == rid)).rowcount,
        "participant": db.execute(delete(ResearchParticipant).where(ResearchParticipant.research_id == rid)).rowcount,
    }
    # 同意紀錄保留「已撤回」狀態作為處理證明（不含任何個資）
    db.execute(update(ConsentRecord).where(ConsentRecord.research_id == rid, ConsentRecord.consent_status == "granted")
               .values(consent_status="withdrawn", withdrawal_time=utcnow()))
    db.add(AuditLog(actor="participant", action="privacy_delete", target=rid, detail=str(counts)))
    db.commit()
    return {"research_id": rid, "deleted": counts, "message": "已刪除此研究編號的研究資料。"}


@router.post("/feedback")
def feedback(body: FeedbackIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    if not body.analysis_id and not body.research_id:
        raise HTTPException(400, "需要分析編號或研究編號。")
    if body.analysis_id and not db.get(AnalysisRecord, body.analysis_id):
        raise HTTPException(404, "找不到分析紀錄。")
    if body.research_id and not db.get(ResearchParticipant, body.research_id):
        raise HTTPException(404, "找不到研究編號。")
    db.add(FeedbackRecord(analysis_id=body.analysis_id, research_id=body.research_id, helpful=body.helpful, rating=body.rating,
                          reason_code=body.reason_code, is_demo=not settings.research_is_formal))
    db.commit()
    return {"recorded": True}


@router.post("/survey")
def survey(body: SurveyIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    db.add(ProductSurveyResponse(**body.model_dump(), is_demo=not settings.research_is_formal))
    db.commit()
    return {"recorded": True, "message": "感謝填答！此問卷只用於商業可行性研究，填答不代表購買。"}
