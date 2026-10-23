"""識詐數據庫 可攜版啟動程式（打包成 ScamCheck.exe）。

雙擊即可：自動找可用埠號、啟動伺服器、開啟瀏覽器。資料都存在 exe 旁邊的 data 資料夾。
參數：
  --lan          允許同一個 Wi-Fi 的手機、平板連線
  --port N       指定埠號（預設從 8000 開始找）
  --no-browser   不自動開啟瀏覽器
  --backup       備份資料庫後結束
  --reset-admin  清除管理員帳密（下次開啟管理頁重新設定）後結束
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from app.config import CONFIG_FILE, DATA_DIR, FROZEN  # noqa: E402

APP_TITLE = "識詐數據庫 可攜版 v0.1"
CONFIG_TEMPLATE = """# 識詐數據庫 可攜版設定檔（修改後請重新啟動程式）
# 管理員帳密會在第一次開啟「管理」頁時自動寫入本檔（只存雜湊值）。

# Google Gemini（Google AI Studio 取得的 API 金鑰）：留空 = 不使用 AI 分析
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
# 每天最多呼叫幾次，避免額度用完或產生費用
GEMINI_DAILY_LIMIT=300

# Cofacts 憑證：留空 = Demo 模式（不查詢、不產生假資料）
COFACTS_APP_ID=
COFACTS_APP_SECRET=

# 研究模式：simulation（模擬，預設）/ formal（須學校審查核准後才可改）
RESEARCH_MODE=simulation
# balanced = 自動平衡 A/B 組；A 或 B = 這段時間全部固定同一組
RESEARCH_GROUP_MODE=balanced
# 研究結束後改成 false 停止蒐集
RESEARCH_COLLECTION_ENABLED=true

# 全班共用同一個網路時，若出現「請求太頻繁」可調高
RATE_LIMIT_ANALYZE_PER_MINUTE=20
RATE_LIMIT_DEFAULT_PER_MINUTE=60

# 透過 Cloudflare Tunnel 對外開放時建議改成 production（會關閉 /api/docs 文件頁）
ENVIRONMENT=development
"""


def pause_exit(code: int = 0):
    if FROZEN:
        try:
            input("\n按 Enter 鍵關閉視窗…")
        except EOFError:
            pass
    sys.exit(code)


def ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        CONFIG_FILE.write_text(CONFIG_TEMPLATE, encoding="utf-8")
    elif "GEMINI_API_KEY" not in CONFIG_FILE.read_text(encoding="utf-8"):
        # 舊版設定檔：補上 Gemini 設定欄位，原本的內容不動
        block = CONFIG_TEMPLATE.split("# Google Gemini", 1)[1].split("# Cofacts", 1)[0]
        with CONFIG_FILE.open("a", encoding="utf-8") as f:
            f.write("\n# Google Gemini" + block)


def running_instance(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=0.6) as r:
            return json.load(r).get("status") == "ok"
    except Exception:
        return False


def port_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def lan_ips() -> list[str]:
    ips = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 80))  # 不會真的送出封包，只用來取得本機網卡 IP
            ips.add(s.getsockname()[0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


def open_when_ready(port: int):
    for _ in range(120):
        if running_instance(port):
            webbrowser.open(f"http://127.0.0.1:{port}/")
            return
        time.sleep(0.5)


def main():
    ap = argparse.ArgumentParser(description=APP_TITLE)
    ap.add_argument("--lan", action="store_true")
    ap.add_argument("--port", type=int)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--backup", action="store_true")
    ap.add_argument("--reset-admin", action="store_true")
    args = ap.parse_args()

    os.system("")  # 讓舊版 Windows 主控台支援色彩碼
    print("=" * 56)
    print(f"  {APP_TITLE}")
    print("=" * 56)
    ensure_data_dir()

    if args.backup:
        from app.scripts.backup_db import backup
        try:
            print(f"已備份到：{backup()}")
        except SystemExit as e:
            print(e)
        pause_exit()

    if args.reset_admin:
        from app.config import remove_config_keys
        changed = remove_config_keys(["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "SECRET_KEY"])
        print("已清除管理員帳密，下次開啟「管理」頁時請重新設定。" if changed else "目前沒有設定管理員帳密。")
        pause_exit()

    # 已經在執行：直接開瀏覽器
    candidates = [args.port] if args.port else list(range(8000, 8011))
    for p in candidates:
        if running_instance(p):
            print(f"程式已經在執行中，直接開啟 http://127.0.0.1:{p}/")
            if not args.no_browser:
                webbrowser.open(f"http://127.0.0.1:{p}/")
            time.sleep(2)
            return

    host = "0.0.0.0" if args.lan else "127.0.0.1"
    port = next((p for p in candidates if port_free(host, p)), None)
    if port is None:
        print("找不到可用的埠號（8000–8010 都被占用），請關閉其他程式或用 --port 指定。")
        pause_exit(1)

    try:
        import uvicorn
        from app.main import app
    except Exception as e:  # 打包缺檔等問題，讓使用者看得到訊息
        print(f"程式載入失敗：{e!r}")
        pause_exit(1)

    print(f"\n  在這台電腦開啟： http://127.0.0.1:{port}/")
    if args.lan:
        for ip in lan_ips():
            print(f"  手機／平板開啟： http://{ip}:{port}/   （需連同一個 Wi-Fi）")
        print("  ※ 若 Windows 防火牆詢問，請允許「私人網路」。")
    print(f"\n  資料資料夾： {DATA_DIR}")
    print("  要結束程式：直接關閉這個視窗。")
    print("  要把資料帶走：先關閉程式，再把整個資料夾壓縮成 zip。\n")

    if not args.no_browser:
        threading.Thread(target=open_when_ready, args=(port,), daemon=True).start()
    try:
        uvicorn.run(app, host=host, port=port, log_level="warning", access_log=False)
    except Exception as e:
        print(f"伺服器發生錯誤：{e!r}")
        pause_exit(1)


if __name__ == "__main__":
    main()
