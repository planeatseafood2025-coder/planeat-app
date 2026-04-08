import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import settings as app_settings
from .database import connect_db, close_db, get_db
from .routers import auth, expenses, budget, users, inventory, chat, profile, notifications, categories, settings, reports, line_webhook, sse, customers, crm_workspaces, segments, google_sheets, deals, activities
from .services.inventory_service import init_warehouses
from .services.category_service import ensure_default_categories
from .services.auth_service import ensure_default_admin

logger = logging.getLogger("planeat.api")


def _setup_logging():
    level = getattr(logging, app_settings.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


_setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    await connect_db()
    await init_warehouses()
    await ensure_default_categories()
    await ensure_default_admin()
    db = get_db()
    await db.otp_tokens.create_index("username")
    await db.otp_tokens.create_index("expiresAt", expireAfterSeconds=0)
    await db.chat_messages.create_index([("roomId", 1), ("createdAt", -1)])
    await db.notifications.create_index("recipientUsername")
    await db.notifications.create_index("createdAt")
    await db.expense_drafts.create_index("recorder")
    await db.expense_drafts.create_index("status")
    await db.expense_drafts.create_index("submittedAt")
    await db.expense_categories.create_index("order")
    await db.expense_categories.create_index("isActive")
    await db.customers.create_index("workspaceId")
    await db.customers.create_index("lineUid")
    await db.customers.create_index("tags")
    await db.customers.create_index("type")
    await db.customers.create_index("status")
    await db.customers.create_index([("workspaceId", 1), ("status", 1)])
    await db.customers.create_index([("name", 1)])
    await db.crm_workspaces.create_index("memberUsernames")
    await db.crm_workspaces.create_index("createdBy")
    await db.customer_segments.create_index("workspaceId")
    await db.customer_segments.create_index("createdAt")
    await db.customers.create_index([("workspaceId", 1), ("segmentIds", 1)])
    await db.deals.create_index("customerId")
    await db.deals.create_index("stage")
    await db.deals.create_index("assignedTo")
    await db.activities.create_index("targetId")
    await db.activities.create_index("targetType")
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
    allow_origins=app_settings.cors_origins.split(","),
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
app.include_router(settings.router)
app.include_router(reports.router)
app.include_router(line_webhook.router)
app.include_router(sse.router)
app.include_router(crm_workspaces.router)
app.include_router(customers.router)
app.include_router(segments.router)
app.include_router(google_sheets.router)
app.include_router(deals.router)
app.include_router(activities.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "PlaNeat API"}
