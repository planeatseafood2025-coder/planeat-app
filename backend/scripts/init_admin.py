"""
Run this script once after first deploy to create the admin user.
Usage: docker exec -it planeat-backend python scripts/init_admin.py
  OR:  python scripts/init_admin.py  (from backend/ directory)
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from app.services.auth_service import hash_password

MONGO_URL = os.getenv("MONGO_URL", "mongodb://planeat:planeat123@localhost:27017/planeat?authSource=admin")
DB_NAME = "planeat"

INITIAL_USERS = [
    {
        "username": "admin",
        "password": "admin1234",
        "name": "ผู้ดูแลระบบ",
        "role": "admin",
        "permissions": {"labor": True, "raw": True, "chem": True, "repair": True},
    },
    {
        "username": "accountant",
        "password": "acc1234",
        "name": "ผู้จัดการบัญชี",
        "role": "accountant",
        "permissions": {"labor": True, "raw": True, "chem": True, "repair": True},
    },
    {
        "username": "recorder",
        "password": "rec1234",
        "name": "พนักงานกรอกข้อมูล",
        "role": "recorder",
        "permissions": {"labor": True, "raw": True, "chem": False, "repair": False},
    },
    {
        "username": "viewer",
        "password": "view1234",
        "name": "ผู้ตรวจสอบ",
        "role": "viewer",
        "permissions": {"labor": False, "raw": False, "chem": False, "repair": False},
    },
]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    for u in INITIAL_USERS:
        existing = await db.users.find_one({"username": u["username"]})
        if existing:
            print(f"[SKIP] {u['username']} already exists")
            continue

        doc = {
            "username": u["username"],
            "password_hash": hash_password(u["password"]),
            "name": u["name"],
            "role": u["role"],
            "permissions": u["permissions"],
        }
        await db.users.insert_one(doc)
        print(f"[OK]   Created user: {u['username']} (role: {u['role']})")

    client.close()
    print("\nDone! รหัสผ่านเริ่มต้น — กรุณาเปลี่ยนรหัสผ่านหลัง login ครั้งแรก")


if __name__ == "__main__":
    asyncio.run(main())
