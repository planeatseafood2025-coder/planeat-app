from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

client: AsyncIOMotorClient = None  # type: ignore
db = None


async def connect_db():
    global client, db
    client = AsyncIOMotorClient(settings.effective_mongo_url)
    db = client[settings.db_name]
    # Ensure indexes
    await db.users.create_index("username", unique=True)
    await db.expenses.create_index("date")
    await db.expenses.create_index("catKey")
    await db.budgets.create_index("monthYear", unique=True)
    await db.inventory_items.create_index([("code", 1), ("warehouseId", 1)], unique=True)
    await db.inventory_items.create_index("warehouseId")
    await db.inventory_items.create_index("category")
    await db.inventory_transactions.create_index("warehouseId")
    await db.inventory_transactions.create_index("itemId")
    await db.inventory_transactions.create_index("createdAt")
    await db.warehouses.create_index("id", unique=True)


async def close_db():
    global client
    if client:
        client.close()


def get_db():
    return db
