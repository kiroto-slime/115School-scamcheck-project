"""資料表定義。原則：不儲存投稿原文、圖片、影片與任何身分資訊。"""
from datetime import datetime, timezone
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_id() -> str:
    return uuid.uuid4().hex


class AnalysisRecord(Base):
    __tablename__ = "analysis_records"
    analysis_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    research_id_nullable: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    media_type: Mapped[str] = mapped_column(String(10))  # text / image / video
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    risk_score_nullable: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(20))
    risk_tags_json: Mapped[str] = mapped_column(Text, default="[]")
    analysis_status: Mapped[str] = mapped_column(String(30))
    rule_version: Mapped[str] = mapped_column(String(40))
    external_ai_used: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_research: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_secondary_use: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    # 只存衍生結果（特徵、建議、處理狀態），不含原文
    result_json: Mapped[str] = mapped_column(Text, default="{}")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    sources: Mapped[list["SourceResult"]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan", passive_deletes=True
    )


class SourceResult(Base):
    __tablename__ = "source_results"
    source_result_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    analysis_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("analysis_records.analysis_id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(30))
    result_status: Mapped[str] = mapped_column(String(30))
    match_type: Mapped[str] = mapped_column(String(20))  # exact / similar / none
    source_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reply_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    checked_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    license_tag: Mapped[str | None] = mapped_column(String(40), nullable=True)

    analysis: Mapped[AnalysisRecord] = relationship(back_populates="sources")


class ResearchParticipant(Base):
    """固定研究組別，避免同一位參與者混到不同實驗條件。"""
    __tablename__ = "research_participants"
    research_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    experiment_group: Mapped[str | None] = mapped_column(String(2), nullable=True)
    pre_case_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    post_case_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ResearchResponse(Base):
    __tablename__ = "research_responses"
    response_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    research_id: Mapped[str] = mapped_column(String(32), index=True)
    experiment_group: Mapped[str] = mapped_column(String(2))
    case_id: Mapped[str] = mapped_column(String(32))
    phase: Mapped[str] = mapped_column(String(20))  # pre / post_initial / post_assisted
    user_decision: Mapped[str] = mapped_column(String(10))  # scam / legit / unsure
    decision_reason_code: Mapped[str] = mapped_column(String(40))  # 使用者自述理由（代碼）
    correctness: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # false_positive / false_negative / unsure
    response_time_ms: Mapped[int] = mapped_column(Integer)
    assistance_used: Mapped[str] = mapped_column(String(30))  # none / general_tips / system_evidence
    system_triggers_json: Mapped[str] = mapped_column(Text, default="[]")  # 系統推測的誘因
    researcher_category: Mapped[str | None] = mapped_column(String(40), nullable=True)  # 研究者人工分類
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ConsentRecord(Base):
    __tablename__ = "consent_records"
    consent_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    research_id: Mapped[str] = mapped_column(String(32), index=True)
    purpose: Mapped[str] = mapped_column(String(30))  # research / secondary_use
    consent_version: Mapped[str] = mapped_column(String(30))
    consent_status: Mapped[str] = mapped_column(String(20))  # granted / declined / withdrawn
    consent_time: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    withdrawal_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)


class PatternDataset(Base):
    __tablename__ = "pattern_dataset"
    pattern_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    scam_category: Mapped[str] = mapped_column(String(60))
    psychological_trigger: Mapped[str] = mapped_column(String(60))
    risk_indicators: Mapped[str] = mapped_column(Text)
    prevention_method: Mapped[str] = mapped_column(Text)
    verification_status: Mapped[str] = mapped_column(String(20), default="draft")
    evidence_source: Mapped[str] = mapped_column(Text)
    source_license: Mapped[str] = mapped_column(String(60))
    human_review_status: Mapped[str] = mapped_column(String(20), default="pending")
    dataset_version: Mapped[str] = mapped_column(String(20), default="v0.1")


class ResearchCase(Base):
    __tablename__ = "research_cases"
    case_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    case_version: Mapped[str] = mapped_column(String(20), default="v1")
    title: Mapped[str] = mapped_column(String(120))
    simulated_content: Mapped[str] = mapped_column(Text)  # 團隊自行撰寫的模擬內容
    verified_label: Mapped[str] = mapped_column(String(10))  # scam / legit
    label_basis: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(String(10))  # easy / medium / hard
    category: Mapped[str] = mapped_column(String(60))
    reviewer_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending / approved / rejected


class FeedbackRecord(Base):
    __tablename__ = "feedback_records"
    feedback_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    analysis_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    research_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    helpful: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ProductSurveyResponse(Base):
    """商業需求問卷：自述意願（不等於實際行為或營收）。"""
    __tablename__ = "product_survey_responses"
    survey_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    respondent_role: Mapped[str] = mapped_column(String(20))  # student / teacher / parent / other
    product: Mapped[str] = mapped_column(String(2))  # A / B / C
    perceived_value: Mapped[int] = mapped_column(Integer)  # 1-5
    most_needed_feature: Mapped[str] = mapped_column(String(40))
    teacher_would_use: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    verbal_interest: Mapped[bool] = mapped_column(Boolean)
    trial_intent: Mapped[bool] = mapped_column(Boolean)
    payment_intent: Mapped[bool] = mapped_column(Boolean)
    acceptable_price_range: Mapped[str] = mapped_column(String(20))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class BusinessEvent(Base):
    """由管理員登錄的「實際試用」「實際付款」行為，與自述意願分開。"""
    __tablename__ = "business_events"
    event_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    product: Mapped[str] = mapped_column(String(2))
    event_type: Mapped[str] = mapped_column(String(20))  # actual_trial / actual_payment
    count: Mapped[int] = mapped_column(Integer, default=1)
    amount_twd: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    log_id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    actor: Mapped[str] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(40))
    target: Mapped[str | None] = mapped_column(String(120), nullable=True)
    detail: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
