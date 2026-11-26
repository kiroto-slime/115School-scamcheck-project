-- 瀏覽器持有隨機登入憑證，資料庫只保存查找用的雜湊及到期時間。
CREATE TABLE admin_sessions (
  key_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
