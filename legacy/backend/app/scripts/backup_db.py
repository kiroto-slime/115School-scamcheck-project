"""備份 SQLite 資料庫到 data/backups/。用法：python -m app.scripts.backup_db"""
from datetime import datetime
from pathlib import Path
import sqlite3

from app.config import DATA_DIR, get_settings


def backup() -> Path:
    url = get_settings().database_url
    if not url.startswith("sqlite:///"):
        raise SystemExit("此功能只支援 SQLite；PostgreSQL 請使用 pg_dump。")
    src = Path(url.replace("sqlite:///", "", 1))
    if not src.exists():
        raise SystemExit("尚未建立資料庫，沒有可備份的資料。")
    out_dir = DATA_DIR / "backups"
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / f"scamcheck_{datetime.now():%Y%m%d_%H%M%S}.db"
    with sqlite3.connect(src) as s, sqlite3.connect(dst) as d:
        s.backup(d)  # 線上備份，程式執行中也安全
    return dst


if __name__ == "__main__":
    print(f"已備份到 {backup()}")
