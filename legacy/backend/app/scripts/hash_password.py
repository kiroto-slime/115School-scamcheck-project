"""產生管理員密碼雜湊與 SECRET_KEY，貼到 .env。用法：python -m app.scripts.hash_password"""
import getpass
import secrets

from app.security import hash_password

if __name__ == "__main__":
    pw = getpass.getpass("請輸入管理員密碼（至少 10 字元）：")
    if len(pw) < 10:
        raise SystemExit("密碼太短，請至少 10 個字元。")
    if pw != getpass.getpass("再輸入一次：") :
        raise SystemExit("兩次輸入不一致。")
    print("\n請把下面兩行加入專案根目錄的 .env：\n")
    print(f"ADMIN_PASSWORD_HASH={hash_password(pw)}")
    print(f"SECRET_KEY={secrets.token_urlsafe(32)}")
