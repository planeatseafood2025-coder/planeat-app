from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import connect_db, close_db, get_db
from .routers import auth, expenses, budget, users, inventory, chat, profile, notifications, categories
from .services.inventory_service import init_warehouses
from .services.category_service import ensure_default_categories


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    await connect_db()
    await init_warehouses()
    await ensure_default_categories()
    db = get_db()
    await db.otp_tokens.create_index("phone")
    await db.otp_tokens.create_index("expiresAt", expireAfterSeconds=0)
    await db.chat_messages.create_index([("roomId", 1), ("createdAt", -1)])
    await db.notifications.create_index("recipientUsername")
    await db.notifications.create_index("createdAt")
    await db.expense_drafts.create_index("recorder")
    await db.expense_drafts.create_index("status")
    await db.expense_drafts.create_index("submittedAt")
    await db.expense_categories.create_index("order")
    await db.expense_categories.create_index("isActive")
    yield
    await close_db()


app = FastAPI(
    title="PlaNeat API",
    description="ระบบจัดการสำนักงาน — FastAPI backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(expenses.router)
app.include_router(budget.router)
app.include_router(users.router)
app.include_router(inventory.router)
app.include_router(chat.router)
app.include_router(profile.router)
app.include_router(notifications.router)
app.include_router(categories.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "PlaNeat API"}
