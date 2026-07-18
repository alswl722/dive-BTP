"""FastAPI 엔트리포인트."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text

from app.routers import companies, dashboard, programs, rankings

app = FastAPI(title="dive-BTP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(companies.router)
app.include_router(rankings.router)
app.include_router(dashboard.router)
app.include_router(programs.router)


@app.get("/")
def root():
    return {"service": "dive-BTP API", "status": "ok"}


@app.get("/health")
def health():
    """DB 연결까지 확인하는 헬스체크."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        return {"status": "ok", "db": "DATABASE_URL 미설정"}
    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception as e:  # noqa: BLE001 — 헬스체크는 원인 그대로 노출
        return {"status": "degraded", "db": f"error: {e}"}
