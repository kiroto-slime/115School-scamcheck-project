-- 全站共用一份排程與最近的監控快照，只保存模型名稱、時間及加總數字。
CREATE TABLE ai_quota_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  interval_minutes INTEGER NOT NULL DEFAULT 30 CHECK (interval_minutes IN (5, 15, 30, 45)),
  auto_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_enabled IN (0, 1)),
  approved_project TEXT,
  next_due INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  attempted_at INTEGER,
  checked_at INTEGER,
  outcome TEXT NOT NULL DEFAULT 'pending',
  snapshot_project TEXT,
  snapshot_day TEXT,
  models_json TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO ai_quota_sync (id) VALUES (1);
