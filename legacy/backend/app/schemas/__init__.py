"""Pydantic 輸入驗證。所有使用者輸入都視為不可信資料。"""
from typing import Literal

from pydantic import BaseModel, Field

ResearchId = Field(default=None, pattern=r"^R[A-Z0-9]{12}$")


class TextAnalyzeIn(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)
    research_id: str | None = ResearchId
    query_cofacts: bool = True
    use_ai: bool = True


class ConsentIn(BaseModel):
    research_id: str | None = ResearchId
    purpose: Literal["research", "secondary_use"]
    status: Literal["granted", "declined", "withdrawn"]


class ResearchStartIn(BaseModel):
    consent_research: bool
    consent_secondary: bool = False


class ResearchAnswerIn(BaseModel):
    research_id: str = Field(pattern=r"^R[A-Z0-9]{12}$")
    case_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    phase: Literal["pre", "post_initial", "post_assisted"]
    user_decision: Literal["scam", "legit", "unsure"]
    decision_reason_code: Literal["link", "money", "personal_data", "urgency", "authority", "too_good", "familiar_sender",
                                  "looks_official", "no_red_flag", "gut_feeling", "system_hint", "other"]
    response_time_ms: int = Field(ge=0, le=3_600_000)


class ResearchIdIn(BaseModel):
    research_id: str = Field(pattern=r"^R[A-Z0-9]{12}$")


class FeedbackIn(BaseModel):
    analysis_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")
    research_id: str | None = ResearchId
    helpful: bool | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    reason_code: Literal["clear", "unclear", "too_long", "wrong_result", "useful_tips", "other"] | None = None


class SurveyIn(BaseModel):
    respondent_role: Literal["student", "teacher", "parent", "other"]
    product: Literal["A", "B", "C"]
    perceived_value: int = Field(ge=1, le=5)
    most_needed_feature: Literal["quick_check", "case_library", "teaching_material", "trend_report", "other"]
    teacher_would_use: bool | None = None
    verbal_interest: bool
    trial_intent: bool
    payment_intent: bool
    acceptable_price_range: Literal["free_only", "1-99", "100-299", "300-999", "1000+"]


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=200)


class SetupIn(BaseModel):
    username: str = Field(pattern=r"^[A-Za-z0-9_]{3,20}$")
    password: str = Field(min_length=10, max_length=200)


class CaseIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    simulated_content: str = Field(min_length=5, max_length=2000)
    verified_label: Literal["scam", "legit"]
    label_basis: str = Field(min_length=1, max_length=1000)
    difficulty: Literal["easy", "medium", "hard"]
    category: str = Field(min_length=1, max_length=60)


class ReviewIn(BaseModel):
    status: Literal["pending", "approved", "rejected"]


class PatternReviewIn(BaseModel):
    human_review_status: Literal["pending", "approved", "rejected"]
    verification_status: Literal["draft", "verified", "deprecated"] | None = None


class ResearcherCategoryIn(BaseModel):
    researcher_category: Literal["ignored_link", "trusted_authority", "greed", "fear", "trusted_acquaintance",
                                 "over_trust_system", "over_suspicion", "careless", "other"] | None


class BusinessEventIn(BaseModel):
    product: Literal["A", "B", "C"]
    event_type: Literal["actual_trial", "actual_payment"]
    count: int = Field(ge=1, le=10_000)
    amount_twd: float | None = Field(default=None, ge=0)
