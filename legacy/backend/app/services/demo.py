"""合成測試資料（全部 is_demo=True，標示 DEMO）。只用於展示與測試，不可當作研究結果。"""
from __future__ import annotations

from datetime import timedelta
import json
import random

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models import (AnalysisRecord, BusinessEvent, ConsentRecord, FeedbackRecord, ProductSurveyResponse, ResearchCase,
                      ResearchParticipant, ResearchResponse, SourceResult, utcnow)
from ..research import pick_case_pair
from .risk_analyzer import RULE_VERSION, analyze_text

DEMO_TEXTS = [
    "【物流通知】您的包裹地址錯誤，請於24小時內點擊 https://bit.ly/x 更新資料並支付手續費。",
    "恭喜您中獎！免費領取禮券，請加LINE客服並提供身分證照片。",
    "老師帶單穩賺不賠，月入十萬，名額有限。",
    "明天社團練習改到下午四點，記得帶水。",
]


def seed_demo(db: Session, participants: int = 12, seed: int = 115) -> dict:
    rng = random.Random(seed)
    cases = list(db.scalars(select(ResearchCase).where(ResearchCase.reviewer_status != "rejected")))
    now = utcnow()
    made = 0
    for i in range(participants):
        pair = pick_case_pair(cases, rng)
        if not pair:
            break
        rid = "RDEMO" + f"{rng.randrange(36 ** 8):08X}"[-8:]
        group = "A" if i % 2 == 0 else "B"
        db.add(ResearchParticipant(research_id=rid, experiment_group=group, pre_case_id=pair[0].case_id, post_case_id=pair[1].case_id,
                                   status="completed", is_demo=True))
        db.add(ConsentRecord(research_id=rid, purpose="research", consent_version="DEMO", consent_status="granted", is_demo=True))
        db.add(ConsentRecord(research_id=rid, purpose="secondary_use", consent_version="DEMO",
                             consent_status=rng.choice(["granted", "declined"]), is_demo=True))
        for phase, case in (("pre", pair[0]), ("post_initial", pair[1]), ("post_assisted", pair[1])):
            decision = rng.choice(["scam", "legit", "unsure"])
            correct = None if decision == "unsure" else decision == case.verified_label
            err = "unsure" if decision == "unsure" else (None if correct else ("false_positive" if case.verified_label == "legit" else "false_negative"))
            assisted = phase == "post_assisted"
            db.add(ResearchResponse(research_id=rid, experiment_group=group, case_id=case.case_id, phase=phase, user_decision=decision,
                                    decision_reason_code=rng.choice(["link", "money", "urgency", "gut_feeling"]), correctness=correct,
                                    error_type=err, response_time_ms=rng.randint(4000, 40000),
                                    assistance_used=("general_tips" if group == "A" else "system_evidence") if assisted else "none",
                                    system_triggers_json=json.dumps(analyze_text(case.simulated_content).tags if assisted and group == "B" else []),
                                    is_demo=True, created_at=now - timedelta(minutes=rng.randint(1, 600))))
        text = rng.choice(DEMO_TEXTS)
        r = analyze_text(text)
        rec = AnalysisRecord(research_id_nullable=rid, media_type="text", source_count=0, risk_score_nullable=r.risk_score,
                             risk_level=r.risk_level, risk_tags_json=json.dumps(r.tags), analysis_status="completed", rule_version=RULE_VERSION,
                             consent_research=True, consent_secondary_use=False, is_demo=True,
                             result_json=json.dumps({"demo": True, "features": [f.to_dict() for f in r.features]}, ensure_ascii=False))
        db.add(rec)
        db.flush()
        db.add(SourceResult(analysis_id=rec.analysis_id, provider="cofacts", result_status="not_configured", match_type="none"))
        db.add(FeedbackRecord(analysis_id=rec.analysis_id, research_id=rid, helpful=rng.random() > 0.3, rating=rng.randint(2, 5), is_demo=True))
        db.add(ProductSurveyResponse(respondent_role=rng.choice(["student", "teacher"]), product=rng.choice("ABC"), perceived_value=rng.randint(1, 5),
                                     most_needed_feature=rng.choice(["quick_check", "case_library", "teaching_material"]), teacher_would_use=None,
                                     verbal_interest=True, trial_intent=rng.random() > 0.5, payment_intent=rng.random() > 0.8,
                                     acceptable_price_range=rng.choice(["free_only", "1-99"]), is_demo=True))
        made += 1
    db.add(BusinessEvent(product="A", event_type="actual_trial", count=3, is_demo=True))
    db.commit()
    return {"participants": made}


def clear_demo(db: Session) -> dict:
    counts = {}
    for model in (ResearchResponse, ConsentRecord, FeedbackRecord, ResearchParticipant, ProductSurveyResponse, BusinessEvent, AnalysisRecord):
        counts[model.__tablename__] = db.execute(delete(model).where(model.is_demo.is_(True))).rowcount
    db.commit()
    return counts
