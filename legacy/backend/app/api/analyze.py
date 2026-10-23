from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db
from ..schemas import TextAnalyzeIn
from ..security import rate_limit
from ..services import media
from ..services.analysis_service import get_record, run_analysis, serialize

router = APIRouter(prefix="/api", tags=["analyze"])
RID_PATTERN = r"^R[A-Z0-9]{12}$"
IMAGE_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
VIDEO_MIME = {".mp4": "video/mp4", ".mov": "video/mov"}


@router.post("/analyze/text", dependencies=[Depends(rate_limit("analyze"))])
def analyze_text_api(body: TextAnalyzeIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    if len(body.text) > settings.max_text_chars:
        raise HTTPException(413, f"文字超過 {settings.max_text_chars} 字上限。")
    rec = run_analysis(db, settings, text=body.text, media_type="text", research_id=body.research_id,
                       query_cofacts=body.query_cofacts, use_ai=body.use_ai)
    return serialize(rec)


async def _analyze_media(kind: str, file: UploadFile, extra_text: str, research_id: str | None, query_cofacts: bool,
                         use_ai: bool, db: Session, settings: Settings):
    if len(extra_text) > settings.max_text_chars:
        raise HTTPException(413, f"補充文字超過 {settings.max_text_chars} 字上限。")
    ai_on = use_ai and settings.ai_mode == "gemini"
    ai_media: list[tuple[str, bytes]] = []
    path = None
    try:
        path = await media.save_upload(file, settings, kind)
        outcome = media.process_image(path) if kind == "image" else media.process_video(path, settings)
        if ai_on:  # 在刪除暫存檔前讀進記憶體，只用於這次 AI 分析
            ext = path.suffix.lower()
            if kind == "image":
                ai_media = [(IMAGE_MIME[ext], path.read_bytes())]
            elif path.stat().st_size <= settings.gemini_max_inline_mb * 1024 * 1024:
                ai_media = [(VIDEO_MIME[ext], path.read_bytes())]
                outcome.notes.append("影片已送交 Gemini 分析畫面與聲音。")
            elif outcome.frame_images:
                ai_media = [("image/png", b) for b in outcome.frame_images]
                outcome.notes.append(f"影片超過 {settings.gemini_max_inline_mb} MB，只把關鍵影格送交 Gemini（不含聲音）。")
        elif kind == "video":
            outcome.notes.append("未使用 AI，因此沒有分析影片語音與語意；旁白重點請在補充文字輸入。")
    except media.MediaError as e:
        raise HTTPException(e.status_code, e.message)
    finally:
        if path is not None:
            path.unlink(missing_ok=True)  # 原始檔一律不保存
        await file.close()

    combined = "\n".join(t for t in (outcome.text, extra_text.strip()) if t)
    info = {"ocr_status": outcome.ocr_status, "frames_extracted": outcome.frames_extracted, "duration_seconds": outcome.duration_seconds,
            "notes": outcome.notes, "used_manual_text": bool(extra_text.strip()), "extracted_chars": len(outcome.text)}
    if not combined.strip() and not ai_media:
        return {"needs_manual_text": True, "media": info,
                "message": "未能從檔案取得文字，請在「補充文字」欄位輸入圖片／影片中的文字後再送出"
                           + ("（或勾選使用 AI 分析）。" if settings.ai_mode == "gemini" else "。")}
    rec = run_analysis(db, settings, text=combined, media_type=kind, research_id=research_id, query_cofacts=query_cofacts,
                       media_info=info, use_ai=use_ai, ai_media=ai_media)
    out = serialize(rec)
    out["extracted_text_preview"] = outcome.text[:1000]  # 只在本次回應中顯示，不保存
    return out


@router.post("/analyze/image", dependencies=[Depends(rate_limit("analyze"))])
async def analyze_image(file: UploadFile = File(...), extra_text: str = Form(""), research_id: str | None = Form(None, pattern=RID_PATTERN),
                        query_cofacts: bool = Form(True), use_ai: bool = Form(True),
                        db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    return await _analyze_media("image", file, extra_text, research_id, query_cofacts, use_ai, db, settings)


@router.post("/analyze/video", dependencies=[Depends(rate_limit("analyze"))])
async def analyze_video(file: UploadFile = File(...), extra_text: str = Form(""), research_id: str | None = Form(None, pattern=RID_PATTERN),
                        query_cofacts: bool = Form(True), use_ai: bool = Form(True),
                        db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    return await _analyze_media("video", file, extra_text, research_id, query_cofacts, use_ai, db, settings)


@router.get("/analysis/{analysis_id}")
def get_analysis(analysis_id: str, db: Session = Depends(get_db)):
    if len(analysis_id) != 32 or not analysis_id.isalnum():
        raise HTTPException(404, "找不到這筆分析結果。")
    return serialize(get_record(db, analysis_id))
