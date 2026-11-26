-- 處理中只記編號、狀態與時間，查核原文不寫入待辦資料表。
CREATE TABLE text_jobs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  failed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX text_jobs_by_time ON text_jobs(created_at);

-- 回覆不關聯查核編號、研究編號或裝置。
CREATE TABLE result_opinions (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  submitted_day TEXT NOT NULL,
  keep_until TEXT NOT NULL
);
CREATE INDEX result_opinions_expiry ON result_opinions(keep_until);
