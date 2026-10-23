"""管理員驗證與請求頻率限制。只使用 Python 標準函式庫，容易維護。"""
from __future__ import annotations

import base64
import collections
import hashlib
import hmac
import secrets
import threading
import time

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..config import Settings, get_settings

ITERATIONS = 310_000


def hash_password(password: str, iterations: int = ITERATIONS) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_b64, hash_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(iters))
        return hmac.compare_digest(dk, base64.b64decode(hash_b64))
    except Exception:
        return False


def _sign(payload: str, key: str) -> str:
    return hmac.new(key.encode(), payload.encode(), hashlib.sha256).hexdigest()


def create_token(username: str, settings: Settings) -> str:
    exp = int(time.time()) + settings.admin_token_minutes * 60
    payload = f"{username}|{exp}"
    raw = f"{payload}|{_sign(payload, settings.secret_key)}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def read_token(token: str, settings: Settings) -> str | None:
    try:
        username, exp, sig = base64.urlsafe_b64decode(token.encode()).decode().split("|")
    except Exception:
        return None
    if not hmac.compare_digest(sig, _sign(f"{username}|{exp}", settings.secret_key)):
        return None
    if int(exp) < time.time():
        return None
    return username


_bearer = HTTPBearer(auto_error=False)


def require_admin(creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
                  settings: Settings = Depends(get_settings)) -> str:
    if not settings.admin_enabled:
        raise HTTPException(503, "管理員功能尚未設定（缺少 ADMIN_PASSWORD_HASH 或 SECRET_KEY）。")
    user = read_token(creds.credentials, settings) if creds else None
    if not user:
        raise HTTPException(401, "需要管理員登入，或登入已逾時。")
    return user


class RateLimiter:
    """記憶體內滑動視窗限制（單機版足夠；多台伺服器時改用 Redis）。"""

    def __init__(self):
        self._hits: dict[str, collections.deque] = collections.defaultdict(collections.deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window: float = 60.0) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def reset(self):
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


LOOPBACK = {"127.0.0.1", "::1", "localhost"}
PROXY_HEADERS = ("cf-connecting-ip", "x-forwarded-for", "x-real-ip", "forwarded")


def client_ip(request: Request) -> str:
    """取得真實訪客 IP。
    經 Cloudflare Tunnel 時，cloudflared 從本機連進來，訪客 IP 放在 CF-Connecting-IP。
    只有「直接連線者是本機」時才採信這個標頭，區網裝置無法偽造。"""
    peer = request.client.host if request.client else "unknown"
    if peer in LOOPBACK:
        forwarded = request.headers.get("cf-connecting-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0]
        if forwarded.strip():
            return forwarded.strip()
    return peer


def is_local_request(request: Request) -> bool:
    """真的是坐在這台電腦前操作（不是經由 Tunnel／反向代理轉進來的外部訪客）。"""
    peer = request.client.host if request.client else ""
    return peer in LOOPBACK and not any(h in request.headers for h in PROXY_HEADERS)


def rate_limit(bucket: str):
    def dep(request: Request, settings: Settings = Depends(get_settings)):
        limit = {
            "analyze": settings.rate_limit_analyze_per_minute,
            "login": settings.rate_limit_login_per_minute,
        }.get(bucket, settings.rate_limit_default_per_minute)
        ip = client_ip(request)
        if not limiter.check(f"{bucket}:{ip}", limit):
            raise HTTPException(429, "請求太頻繁，請稍候一分鐘再試。")
    return dep
