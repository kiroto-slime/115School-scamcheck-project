"""研究統計。只計算資料庫中的實際紀錄；沒有資料時回傳 0 / None，不產生假數據。"""
from __future__ import annotations

from collections import Counter
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (AnalysisRecord, BusinessEvent, FeedbackRecord, ProductSurveyResponse, ResearchParticipant,
                      ResearchResponse, SourceResult)


def _rate(num: int, den: int) -> float | None:
    return round(num / den, 4) if den else None


def compute_statistics(db: Session, demo: bool) -> dict:
    analyses = list(db.scalars(select(AnalysisRecord).where(AnalysisRecord.is_demo == demo, AnalysisRecord.consent_research.is_(True))))
    ids = {a.analysis_id for a in analyses}
    sources = [s for s in db.scalars(select(SourceResult)) if s.analysis_id in ids]
    responses = list(db.scalars(select(ResearchResponse).where(ResearchResponse.is_demo == demo)))
    participants = list(db.scalars(select(ResearchParticipant).where(ResearchParticipant.is_demo == demo)))
    feedback = list(db.scalars(select(FeedbackRecord).where(FeedbackRecord.is_demo == demo)))

    # 查核成功率：外部查詢有完成（找到或確定查無）的比例；未設定憑證、略過不計入分母
    attempted = [s for s in {s.analysis_id: s for s in sources}.values() if s.result_status in ("found", "not_found", "error", "rate_limited")]
    succeeded = [s for s in attempted if s.result_status in ("found", "not_found")]

    by_rid: dict[str, dict[str, ResearchResponse]] = {}
    for r in responses:
        by_rid.setdefault(r.research_id, {})[r.phase] = r
    complete = {rid: ph for rid, ph in by_rid.items() if "pre" in ph and "post_assisted" in ph}

    groups = {}
    for g in ("A", "B"):
        rows = [ph for rid, ph in complete.items() if ph["pre"].experiment_group == g]
        pre_ok = sum(1 for ph in rows if ph["pre"].correctness)
        post_ok = sum(1 for ph in rows if ph["post_assisted"].correctness)
        changed = sum(1 for ph in rows if "post_initial" in ph and ph["post_initial"].user_decision != ph["post_assisted"].user_decision)
        pre_acc, post_acc = _rate(pre_ok, len(rows)), _rate(post_ok, len(rows))
        groups[g] = {
            "participants": sum(1 for p in participants if p.experiment_group == g),
            "valid_samples": len(rows),
            "pre_accuracy": pre_acc,
            "post_accuracy": post_acc,
            "accuracy_change": round(post_acc - pre_acc, 4) if pre_acc is not None and post_acc is not None else None,
            "decision_changed_after_assist": changed,
        }

    errors = Counter(r.error_type for r in responses if r.error_type)
    judged = [r for r in responses if r.phase in ("pre", "post_assisted")]
    tags = Counter(t for a in analyses for t in json.loads(a.risk_tags_json or "[]"))
    helpful = [f.helpful for f in feedback if f.helpful is not None]
    ratings = [f.rating for f in feedback if f.rating]

    surveys = list(db.scalars(select(ProductSurveyResponse).where(ProductSurveyResponse.is_demo == demo)))
    events = list(db.scalars(select(BusinessEvent).where(BusinessEvent.is_demo == demo)))
    business = {}
    for p in ("A", "B", "C"):
        s = [x for x in surveys if x.product == p]
        business[p] = {
            "survey_responses": len(s),
            "avg_perceived_value": round(sum(x.perceived_value for x in s) / len(s), 2) if s else None,
            "verbal_interest": sum(1 for x in s if x.verbal_interest),
            "trial_intent": sum(1 for x in s if x.trial_intent),
            "payment_intent": sum(1 for x in s if x.payment_intent),
            "actual_trial": sum(e.count for e in events if e.product == p and e.event_type == "actual_trial"),
            "actual_payment": sum(e.count for e in events if e.product == p and e.event_type == "actual_payment"),
        }

    return {
        "dataset": "demo" if demo else "formal",
        "analysis_records": len(analyses),
        "participants": len(participants),
        "valid_samples": len(complete),
        "groups": groups,
        "source_check": {"attempted": len(attempted), "succeeded": len(succeeded), "success_rate": _rate(len(succeeded), len(attempted))},
        "judgement": {
            "answers": len(judged),
            "accuracy": _rate(sum(1 for r in judged if r.correctness), len(judged)),
            "false_positive": errors.get("false_positive", 0),
            "false_negative": errors.get("false_negative", 0),
            "unsure": errors.get("unsure", 0),
        },
        "risk_tag_counts": dict(tags.most_common()),
        "feedback": {
            "count": len(feedback),
            "helpful_yes": sum(1 for h in helpful if h),
            "helpful_no": sum(1 for h in helpful if not h),
            "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        },
        "business": business,
    }
