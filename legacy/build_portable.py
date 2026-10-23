"""產生 Windows 可攜版（免安裝、綠色軟體）zip。

用法（在專案根目錄）：
    backend\\.venv\\Scripts\\python build_portable.py

步驟：建置前端 → PyInstaller 打包（onedir）→ 加入捷徑 .bat 與使用說明 → 壓縮成 release/*.zip
"""
from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
BUILD = ROOT / "build_portable"
APP_NAME = "ScamCheck"
VERSION = "0.1"
ZIP_NAME = f"識詐數據庫_可攜版_v{VERSION}_Windows.zip"

# .bat 只用 ASCII 指令，避免 cmd 編碼問題；中文訊息由 exe 本身輸出
BATS = {
    "啟動（允許手機連線）.bat": '@echo off\r\ncd /d "%~dp0"\r\nScamCheck.exe --lan\r\n',
    "備份資料庫.bat": '@echo off\r\ncd /d "%~dp0"\r\nScamCheck.exe --backup\r\n',
    "重設管理員密碼.bat": '@echo off\r\ncd /d "%~dp0"\r\nScamCheck.exe --reset-admin\r\n',
}


def run(cmd: list[str], cwd: Path):
    print(">", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True, shell=(sys.platform == "win32" and cmd[0] == "npm"))


def make_icon(path: Path):
    from PIL import Image, ImageDraw
    im = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(128, 12), (32, 52), (32, 120), (60, 190), (128, 244), (196, 190), (224, 120), (224, 52)], fill=(15, 118, 110))
    d.line([(84, 130), (116, 162), (176, 98)], fill="white", width=24, joint="curve")
    im.save(path, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


def main():
    BUILD.mkdir(exist_ok=True)
    if "--package-only" in sys.argv:  # 只重新放入說明檔／bat 並壓縮
        return package(BUILD / "dist" / APP_NAME)
    if "--skip-frontend" not in sys.argv:
        run(["npm", "run", "build"], FRONTEND)
    dist_web = FRONTEND / "dist"
    if not (dist_web / "index.html").exists():
        raise SystemExit("找不到 frontend/dist，請先執行 npm run build")

    icon = BUILD / "icon.ico"
    make_icon(icon)
    sep = ";" if sys.platform == "win32" else ":"
    run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--console",
         "--name", APP_NAME, "--icon", str(icon),
         "--distpath", str(BUILD / "dist"), "--workpath", str(BUILD / "work"), "--specpath", str(BUILD),
         "--paths", str(BACKEND),
         "--add-data", f"{dist_web}{sep}frontend_dist",
         "--collect-data", "rapidocr_onnxruntime",
         "--collect-binaries", "onnxruntime",
         "--collect-data", "imageio_ffmpeg",
         "--collect-submodules", "uvicorn",
         "--collect-submodules", "app",
         "--hidden-import", "rapidocr_onnxruntime",
         "--exclude-module", "tkinter", "--exclude-module", "pytest", "--exclude-module", "matplotlib",
         str(BACKEND / "launcher.py")], ROOT)

    package(BUILD / "dist" / APP_NAME)


def package(out: Path):
    if not (out / f"{APP_NAME}.exe").exists():
        raise SystemExit("找不到已打包的 exe，請先完整建置一次")
    for name, content in BATS.items():
        (out / name).write_bytes(content.encode("ascii"))
    shutil.copy(ROOT / "docs" / "使用說明.html", out / "使用說明.html")
    shutil.rmtree(out / "data", ignore_errors=True)  # 發佈版不帶任何資料

    release = ROOT / "release"
    release.mkdir(exist_ok=True)
    zpath = release / ZIP_NAME
    zpath.unlink(missing_ok=True)
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for f in sorted(out.rglob("*")):
            z.write(f, Path(APP_NAME) / f.relative_to(out))
    print(f"\n完成：{zpath}（{zpath.stat().st_size / 1024 / 1024:.0f} MB）")


if __name__ == "__main__":
    main()
