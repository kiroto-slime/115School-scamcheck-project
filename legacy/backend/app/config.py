"""集中管理設定。所有敏感值只從環境變數 / .env 讀取，不寫死在程式碼。"""
from functools import lru_cache
from pathlib import Path
import sys
import tempfile

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent

# 可攜版（PyInstaller 打包）：所有資料放在 exe 旁邊的 data 資料夾，整個資料夾壓縮就能帶走
FROZEN = getattr(sys, "frozen", False)
APP_HOME = Path(sys.executable).resolve().parent if FROZEN else BACKEND_DIR
DATA_DIR = APP_HOME / "data"
CONFIG_FILE = DATA_DIR / "config.env"  # 首次設定的管理員密碼雜湊等寫在這裡
FRONTEND_DIST = Path(getattr(sys, "_MEIPASS", "")) / "frontend_dist" if FROZEN else PROJECT_DIR / "frontend" / "dist"
_ENV_FILES = (str(CONFIG_FILE),) if FROZEN else (str(PROJECT_DIR / ".env"), str(BACKEND_DIR / ".env"), str(CONFIG_FILE))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "識詐數據庫"
    environment: str = "development"  # development / production
    database_url: str = f"sqlite:///{(DATA_DIR / 'scamcheck.db').as_posix()}"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # 管理員：密碼只存雜湊值（用 scripts/hash_password.py 產生）
    admin_username: str = "admin"
    admin_password_hash: str = ""
    secret_key: str = ""
    admin_token_minutes: int = 120

    # Cofacts：沒有憑證時自動使用 Mock Mode
    cofacts_api_url: str = "https://api.cofacts.tw/graphql"
    cofacts_app_id: str = ""
    cofacts_app_secret: str = ""
    cofacts_timeout_seconds: float = 8.0
    cofacts_max_retries: int = 2
    cofacts_daily_limit: int = 500  # 保護外部服務與避免非預期用量

    # AI：auto（有金鑰就用 Gemini）/ gemini / disabled / mock（示範用）
    ai_provider: str = "auto"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    gemini_timeout_seconds: float = 90.0
    gemini_daily_limit: int = 300  # 保護免費額度與避免非預期費用
    gemini_max_inline_mb: int = 14  # 超過就改送關鍵影格（API 單次請求上限約 20 MB，base64 會膨脹）

    # 上傳限制（開發預設值，非外部服務官方限制）
    max_text_chars: int = 10_000
    max_image_mb: int = 10
    max_video_mb: int = 20
    max_video_seconds: int = 30
    video_max_frames: int = 5
    upload_tmp_dir: str = str(Path(tempfile.gettempdir()) / "scamcheck_tmp")

    # 頻率限制（每個 IP 每分鐘）
    rate_limit_analyze_per_minute: int = 20
    rate_limit_login_per_minute: int = 5
    rate_limit_default_per_minute: int = 60

    # 研究設定
    research_collection_enabled: bool = True
    # simulation：所有研究資料都標記為 DEMO；formal：需學校審查核准後才可設定
    research_mode: str = "simulation"
    research_group_mode: str = "balanced"  # balanced / A / B
    consent_version: str = "2026.10-v0.1"

    # 保存期限
    temp_analysis_retention_hours: int = 24
    research_retention_days: int = 365

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cofacts_live(self) -> bool:
        return bool(self.cofacts_app_id and self.cofacts_app_secret)

    @property
    def ai_mode(self) -> str:
        """實際使用的 AI：gemini / mock / disabled"""
        if self.ai_provider == "mock":
            return "mock"
        if self.ai_provider in ("auto", "gemini") and self.gemini_api_key:
            return "gemini"
        return "disabled"

    @property
    def admin_enabled(self) -> bool:
        return bool(self.admin_password_hash and self.secret_key)

    @property
    def research_is_formal(self) -> bool:
        return self.research_mode == "formal"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def save_config_values(values: dict[str, str]) -> None:
    """更新 data/config.env 中的設定（保留其他行與註解）。值用單引號包住，避免 $ 等字元被展開。"""
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = CONFIG_FILE.read_text(encoding="utf-8").splitlines() if CONFIG_FILE.exists() else []
    remaining = dict(values)
    out = []
    for line in lines:
        key = line.split("=", 1)[0].strip()
        if key in remaining:
            out.append(f"{key}='{remaining.pop(key)}'")
        else:
            out.append(line)
    out += [f"{k}='{v}'" for k, v in remaining.items()]
    CONFIG_FILE.write_text("\n".join(out) + "\n", encoding="utf-8")


def remove_config_keys(keys: list[str]) -> bool:
    if not CONFIG_FILE.exists():
        return False
    lines = CONFIG_FILE.read_text(encoding="utf-8").splitlines()
    kept = [ln for ln in lines if ln.split("=", 1)[0].strip() not in keys]
    CONFIG_FILE.write_text("\n".join(kept) + "\n", encoding="utf-8")
    return len(kept) != len(lines)
