from io import BytesIO
import subprocess

from PIL import Image, ImageDraw
import pytest

from app.services.media import ffmpeg_path
from conftest import tmp_upload_files


def _png(text="Transfer money now", size=(640, 160)) -> bytes:
    im = Image.new("RGB", size, "white")
    ImageDraw.Draw(im).text((20, 60), text, fill="black", font_size=40)
    buf = BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def test_invalid_image_format(client, settings):
    r = client.post("/api/analyze/image", files={"file": ("a.gif", b"GIF89a....", "image/gif")})
    assert r.status_code == 415 and "JPG" in r.json()["detail"]


def test_image_content_mismatch(client, settings):
    r = client.post("/api/analyze/image", files={"file": ("a.png", b"\xff\xd8\xff" + b"0" * 100, "image/png")})
    assert r.status_code == 415
    assert tmp_upload_files(settings) == []  # 失敗時也清除暫存檔


def test_fake_video_rejected(client, settings):
    r = client.post("/api/analyze/video", files={"file": ("v.mp4", b"not a video at all", "video/mp4")})
    assert r.status_code == 415
    assert tmp_upload_files(settings) == []


def test_image_too_large(client, settings):
    settings.max_image_mb = 1
    r = client.post("/api/analyze/image", files={"file": ("big.png", b"\x89PNG\r\n\x1a\n" + b"0" * (1024 * 1024 + 10), "image/png")})
    assert r.status_code == 413 and "1 MB" in r.json()["detail"]
    assert tmp_upload_files(settings) == []


def test_image_processed_and_temp_deleted(client, settings):
    r = client.post("/api/analyze/image", files={"file": ("shot.png", _png(), "image/png")},
                    data={"extra_text": "請立即匯款到指定帳戶"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["media"]["ocr_status"] in ("success", "no_text", "unavailable", "failed")
    assert body["media"]["used_manual_text"] is True
    assert "financial_request" in body["risk_tags"]
    assert tmp_upload_files(settings) == []


def test_image_without_text_asks_manual_input(client, settings):
    im = Image.new("RGB", (200, 200), "white")
    buf = BytesIO()
    im.save(buf, "JPEG")
    r = client.post("/api/analyze/image", files={"file": ("blank.jpg", buf.getvalue(), "image/jpeg")})
    assert r.status_code == 200
    assert r.json().get("needs_manual_text") is True


def _make_video(path, seconds):
    ff = ffmpeg_path()
    if not ff:
        pytest.skip("FFmpeg 不可用")
    subprocess.run([ff, "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"testsrc=size=320x240:rate=5:duration={seconds}",
                    "-pix_fmt", "yuv420p", str(path)], check=True, timeout=60)
    return path.read_bytes()


def test_video_frames_extracted_and_temp_deleted(client, settings, tmp_path):
    data = _make_video(tmp_path / "v.mp4", 3)
    r = client.post("/api/analyze/video", files={"file": ("v.mp4", data, "video/mp4")}, data={"extra_text": "限時投資保證獲利，加LINE"})
    assert r.status_code == 200, r.text
    m = r.json()["media"]
    assert m["frames_extracted"] >= 1 and m["duration_seconds"] == pytest.approx(3, abs=0.5)
    assert tmp_upload_files(settings) == []


def test_video_too_long(client, settings, tmp_path):
    settings.max_video_seconds = 2
    data = _make_video(tmp_path / "long.mp4", 4)
    r = client.post("/api/analyze/video", files={"file": ("long.mp4", data, "video/mp4")})
    assert r.status_code == 413 and "秒" in r.json()["detail"]
    assert tmp_upload_files(settings) == []
