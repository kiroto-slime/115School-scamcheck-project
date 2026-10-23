"""建立 DEMO 合成資料（標記為模擬）。用法：python -m app.scripts.seed_demo [--clear]"""
import sys

from app import database
from app.research import seed_reference_data
from app.services.demo import clear_demo, seed_demo

if __name__ == "__main__":
    database.init_db()
    db = database.SessionLocal()
    try:
        seed_reference_data(db)
        print(clear_demo(db) if "--clear" in sys.argv else seed_demo(db))
    finally:
        db.close()
