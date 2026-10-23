-- 教學遊戲專用題庫，與正式研究題目及作答分開。
CREATE TABLE game_questions (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  updated_at TEXT NOT NULL
);
