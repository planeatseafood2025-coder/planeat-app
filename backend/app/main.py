from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import connect_db, close_db
from .routers import auth, expenses, budget, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title="PlaNeat API",
    description="ระบบจัดการสำนักงาน — FastAPI backend",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow all origins (use specific IP in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(expenses.router)
app.include_router(budget.router)
app.include_router(users.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "PlaNeat API"}
