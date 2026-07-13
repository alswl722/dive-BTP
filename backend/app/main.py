"""FastAPI 엔트리포인트.

⚠️ 라우터/스키마/서비스 로직은 아직 없음 — docker compose 전체 스택이
   부팅되도록 하는 최소 스텁(헬스체크만). 각 축 담당자가 라우터를 추가하면 됨.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text

app = FastAPI(title="dive-BTP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
