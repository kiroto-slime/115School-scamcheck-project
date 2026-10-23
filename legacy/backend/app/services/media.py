"""圖片與影片的暫時性處理流程。

- 先檢查副檔名、檔頭（magic bytes）與大小，再寫入暫存資料夾。
- 圖片：Pillow 驗證 → RapidOCR 擷取文字（若未安裝則明確回報無法辨識）。
- 影片：FFmpeg（imageio-ffmpeg 內建）取得長度並擷取少量關鍵影格 → OCR。
- 不做語音辨識與影片語意理解（P1）。
- 不論成功或失敗，暫存檔都在 finally 中刪除。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import uuid

from fastapi import UploadFile

from ..config import Settings

IMAGE_EXT = {".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".webp": "webp"}
VIDEO_EXT = {".mp4", ".mov"}


class MediaError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message, self.status_code = message, status_code


@dataclass
class MediaOutcome:
    text: str = ""
    ocr_status: str = "not_run"  # success / no_text / unavailable / failed / not_run
    frames_extracted: int = 0
    duration_seconds: float | None = None
    notes: list[str] = field(default_factory=list)
    frame_images: list[bytes] = field(default_factory=list)  # 只在記憶體中，供 AI 使用


# ---------- 工具偵測 ----------
_ocr_engine = None
_ocr_checked = False


def get_ocr():
    global _ocr_engine, _ocr_checked
    if not _ocr_checked:
        _ocr_checked = True
        try:
            from rapidocr_onnxruntime import RapidOCR  # type: ignore
            _ocr_engine = RapidOCR()
        except Exception:
            _ocr_engine = None
    return _ocr_engine


def ocr_available() -> bool:
    try:
        import rapidocr_onnxruntime  # noqa: F401
        return True
    except Exception:
        return False


def ffmpeg_path() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg  # type: ignore
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


# ---------- 檢查 ----------
def _sniff_image(head: bytes) -> str | None:
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def _sniff_video(head: bytes) -> bool:
    return head[4:8] == b"ftyp"  # MP4 / MOV 都是 ISO BMFF 容器


async def save_upload(upload: UploadFile, settings: Settings, kind: str) -> Path:
    """分段讀取並限制大小，寫入隨機檔名的暫存檔。"""
    name = (upload.filename or "").lower()
    ext = Path(name).suffix
    if kind == "image" and ext not in IMAGE_EXT:
        raise MediaError("圖片格式不支援，請上傳 JPG、PNG 或 WebP。", 415)
    if kind == "video" and ext not in VIDEO_EXT:
        raise MediaError("影片格式不支援，請上傳 MP4 或 MOV。", 415)
    limit_mb = settings.max_image_mb if kind == "image" else settings.max_video_mb
    limit = limit_mb * 1024 * 1024

    tmp_dir = Path(settings.upload_tmp_dir)
    tmp_dir.mkdir(parents=True, exist_ok=True)
    path = tmp_dir / f"{uuid.uuid4().hex}{ext}"
    size = 0
    head = b""
    try:
        with path.open("wb") as fh:
            while chunk := await upload.read(1024 * 256):
                size += len(chunk)
                if size > limit:
                    raise MediaError(f"檔案超過 {limit_mb} MB 上限，請壓縮或裁切後再上傳。", 413)
                if len(head) < 16:
                    head += chunk[:16]
                fh.write(chunk)
        if size == 0:
            raise MediaError("檔案是空的，請重新選擇。")
        if kind == "image":
            real = _sniff_image(head)
            if real is None or real != IMAGE_EXT[ext]:
                raise MediaError("檔案內容與副檔名不符，或不是有效的圖片。", 415)
        elif not _sniff_video(head):
            raise MediaError("檔案內容不是有效的 MP4 / MOV 影片。", 415)
        return path
    except Exception:
        path.unlink(missing_ok=True)
        raise


def _ocr_image_file(path: Path) -> tuple[str, str]:
    engine = get_ocr()
    if engine is None:
        return "", "unavailable"
    try:
        result, _ = engine(path.read_bytes())  # 以位元組傳入，避免中文路徑問題
    except Exception:
        return "", "failed"
    lines = [item[1] for item in (result or []) if len(item) > 2 and float(item[2]) >= 0.5]
    return ("\n".join(lines), "success") if lines else ("", "no_text")


def process_image(path: Path) -> MediaOutcome:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 40_000_000  # 防止解壓縮炸彈
    out = MediaOutcome()
    try:
        with Image.open(path) as im:
            im.verify()
        with Image.open(path) as im:
            if im.width * im.height > Image.MAX_IMAGE_PIXELS:
                raise MediaError("圖片解析度過大。")
    except MediaError:
        raise
    except Exception:
        raise MediaError("圖片已損毀或無法讀取。", 415)
    out.text, out.ocr_status = _ocr_image_file(path)
    if out.ocr_status == "unavailable":
        out.notes.append("伺服器未安裝 OCR 元件，無法自動辨識圖片文字，請在下方手動輸入圖片中的文字。")
    elif out.ocr_status in ("no_text", "failed"):
        out.notes.append("未能從圖片辨識出文字，請手動補充圖片中的文字。")
    else:
        out.notes.append("圖片文字由 OCR 自動辨識，可能有錯字，請以原圖為準。")
    return out


_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")


def process_video(path: Path, settings: Settings) -> MediaOutcome:
    out = MediaOutcome()
    ff = ffmpeg_path()
    if not ff:
        out.ocr_status = "unavailable"
        out.notes.append("伺服器未安裝 FFmpeg，無法擷取影格，請手動輸入影片中的文字或旁白重點。")
        return out
    probe = subprocess.run([ff, "-hide_banner", "-i", str(path)], capture_output=True, text=True, timeout=30,
                           encoding="utf-8", errors="ignore")
    m = _DURATION_RE.search(probe.stderr or "")
    if not m:
        raise MediaError("無法讀取影片長度，檔案可能已損毀。", 415)
    duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    out.duration_seconds = round(duration, 1)
    if duration > settings.max_video_seconds:
        raise MediaError(f"影片長度 {duration:.0f} 秒，超過 {settings.max_video_seconds} 秒上限，請剪輯後再上傳。", 413)

    frame_dir = Path(tempfile.mkdtemp(prefix="frames_", dir=settings.upload_tmp_dir))
    try:
        n = settings.video_max_frames
        fps = max(n / max(duration, 0.1), 0.01)
        subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-i", str(path), "-vf", f"fps={fps:.4f},scale='min(1280,iw)':-2",
                        "-frames:v", str(n), str(frame_dir / "f_%02d.png")], capture_output=True, timeout=60)
        frames = sorted(frame_dir.glob("f_*.png"))
        out.frames_extracted = len(frames)
        out.frame_images = [f.read_bytes() for f in frames]
        if not frames:
            out.ocr_status = "failed"
            out.notes.append("未能擷取影格，請手動輸入影片內容。")
            return out
        seen: list[str] = []
        statuses = set()
        for f in frames:
            text, status = _ocr_image_file(f)
            statuses.add(status)
            for line in text.splitlines():
                if line and line not in seen:
                    seen.append(line)
        out.text = "\n".join(seen)
        out.ocr_status = "success" if seen else ("unavailable" if statuses == {"unavailable"} else "no_text")
        out.notes.append(f"已擷取 {len(frames)} 張關鍵影格進行文字辨識。")
        if not seen:
            out.notes.append("影格中未辨識出文字，請手動補充影片中的文字或旁白重點。")
        return out
    finally:
        shutil.rmtree(frame_dir, ignore_errors=True)


def cleanup_stale_tmp(settings: Settings, max_age_seconds: int = 3600) -> int:
    """啟動時清除異常中斷遺留的暫存檔。"""
    tmp = Path(settings.upload_tmp_dir)
    if not tmp.exists():
        return 0
    removed = 0
    now = time.time()
    for p in tmp.iterdir():
        try:
            if now - p.stat().st_mtime > max_age_seconds:
                shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
                removed += 1
        except OSError:
            pass
    return removed
