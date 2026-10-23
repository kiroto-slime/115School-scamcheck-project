-- 識詐數據庫 D1 schema（與 v0.1 Python 版相同欄位）。
-- 原則：不存投稿原文、圖片、影片與任何身分資訊。時間一律為 UTC ISO 字串，布林為 0/1。

CREATE TABLE analysis_records (
  analysis_id TEXT PRIMARY KEY,
  research_id_nullable TEXT,
  created_at TEXT NOT NULL,
  media_type TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  risk_score_nullable INTEGER,
  risk_level TEXT NOT NULL,
  risk_tags_json TEXT NOT NULL DEFAULT '[]',
  analysis_status TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  external_ai_used INTEGER NOT NULL DEFAULT 0,
  consent_research INTEGER NOT NULL DEFAULT 0,
  consent_secondary_use INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 1,
  result_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT
);
CREATE INDEX idx_analysis_rid ON analysis_records(research_id_nullable);
CREATE INDEX idx_analysis_expires ON analysis_records(expires_at);
CREATE INDEX idx_analysis_created ON analysis_records(created_at);

CREATE TABLE source_results (
  source_result_id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analysis_records(analysis_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  result_status TEXT NOT NULL,
  match_type TEXT NOT NULL,
  source_title TEXT,
  source_url TEXT,
  reply_type TEXT,
  checked_at TEXT NOT NULL,
  license_tag TEXT
);
CREATE INDEX idx_source_analysis ON source_results(analysis_id);

CREATE TABLE research_participants (
  research_id TEXT PRIMARY KEY,
  experiment_group TEXT,
  pre_case_id TEXT,
  post_case_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE research_responses (
  response_id TEXT PRIMARY KEY,
  research_id TEXT NOT NULL,
  experiment_group TEXT NOT NULL,
  case_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  user_decision TEXT NOT NULL,
  decision_reason_code TEXT NOT NULL,
  correctness INTEGER,
  error_type TEXT,
  response_time_ms INTEGER NOT NULL,
  assistance_used TEXT NOT NULL,
  system_triggers_json TEXT NOT NULL DEFAULT '[]',
  researcher_category TEXT,
  is_demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_responses_rid ON research_responses(research_id);

CREATE TABLE consent_records (
  consent_id TEXT PRIMARY KEY,
  research_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consent_status TEXT NOT NULL,
  consent_time TEXT NOT NULL,
  withdrawal_time TEXT,
  is_demo INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_consent_rid ON consent_records(research_id);

CREATE TABLE pattern_dataset (
  pattern_id TEXT PRIMARY KEY,
  scam_category TEXT NOT NULL,
  psychological_trigger TEXT NOT NULL,
  risk_indicators TEXT NOT NULL,
  prevention_method TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'draft',
  evidence_source TEXT NOT NULL,
  source_license TEXT NOT NULL,
  human_review_status TEXT NOT NULL DEFAULT 'pending',
  dataset_version TEXT NOT NULL DEFAULT 'v0.1'
);

CREATE TABLE research_cases (
  case_id TEXT PRIMARY KEY,
  case_version TEXT NOT NULL DEFAULT 'v1',
  title TEXT NOT NULL,
  simulated_content TEXT NOT NULL,
  verified_label TEXT NOT NULL,
  label_basis TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  category TEXT NOT NULL,
  reviewer_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE feedback_records (
  feedback_id TEXT PRIMARY KEY,
  analysis_id TEXT,
  research_id TEXT,
  helpful INTEGER,
  rating INTEGER,
  reason_code TEXT,
  is_demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE product_survey_responses (
  survey_id TEXT PRIMARY KEY,
  respondent_role TEXT NOT NULL,
  product TEXT NOT NULL,
  perceived_value INTEGER NOT NULL,
  most_needed_feature TEXT NOT NULL,
  teacher_would_use INTEGER,
  verbal_interest INTEGER NOT NULL,
  trial_intent INTEGER NOT NULL,
  payment_intent INTEGER NOT NULL,
  acceptable_price_range TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE business_events (
  event_id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  event_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  amount_twd REAL,
  is_demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  log_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

-- 管理頁「系統設定」可調整的值（取代 v0.1 的 config.env）
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 每日用量計數（Gemini、Cofacts 每日上限）
CREATE TABLE usage_counters (
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name)
);
