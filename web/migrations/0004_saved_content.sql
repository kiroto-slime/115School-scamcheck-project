-- 同意新版研究同意者：保存「遮蔽個資、去除網址參數」後的訊息內容，供研究與易讀匯出使用
ALTER TABLE analysis_records ADD COLUMN content_text TEXT;
ALTER TABLE analysis_records ADD COLUMN content_urls_json TEXT;
ALTER TABLE analysis_records ADD COLUMN content_edited INTEGER NOT NULL DEFAULT 0;

-- 若管理員曾把設定寫進資料庫，一併升級（沒有這兩列時不影響）
UPDATE app_settings SET value = '"2026.11-v0.3"' WHERE key = 'consent_version';
UPDATE app_settings SET value = '730' WHERE key = 'research_retention_days';
