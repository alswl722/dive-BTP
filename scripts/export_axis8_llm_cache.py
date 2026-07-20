"""축8 LLM 판정 캐시 DB → 리포지토리 JSON fixture 덤프.

용도:
  기술리드가 scripts/run_axis8_llm_batch.py로 판정을 채운 뒤 이 스크립트를 돌려
  결과를 backend/app/services/axis8_llm_cache.json에 덤프. 이 JSON을 커밋하면
  DEEPSEEK_API_KEY 없는 팀원도 pull만 받아 판정 결과를 볼 수 있다
  (companies._load_llm_cache가 fixture → DB 순으로 로드).

사용법:
  # 로컬 (Postgres 5432 listening)
  python scripts/export_axis8_llm_cache.py

  # 도커 안에서
  docker compose exec backend python /app/../scripts/export_axis8_llm_cache.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "backend" / "app" / "services" / "axis8_llm_cache.json"

# .env 로드 (있으면)
try:
    from dotenv import load_dotenv
    for env_path in [Path("/.env"), ROOT / ".env"]:
        if env_path.exists():
            load_dotenv(env_path)
            break
except ImportError:
    pass


def get_engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        # 로컬 실행 fallback — docker 안에서는 env로 주입됨
        url = "postgresql://foedev:foedev@localhost:5432/foedev"
    return create_engine(url)


def main():
    engine = get_engine()
    with engine.connect() as conn:
        try:
            rows = conn.execute(text("""
                SELECT company_id, program_code, purposes_hash, score, match_type,
                       matched_keywords, reasoning, model, updated_at
                FROM axis8_llm_cache
                ORDER BY company_id, program_code
            """)).mappings().all()
        except Exception as e:
            sys.exit(f"❌ axis8_llm_cache 테이블 조회 실패: {e}\n"
                     f"먼저 scripts/run_axis8_llm_batch.py 실행 필요.")

    items = []
    for r in rows:
        try:
            keywords = json.loads(r["matched_keywords"]) if r["matched_keywords"] else []
        except (TypeError, ValueError):
            keywords = []
        items.append({
            "company_id": int(r["company_id"]),
            "program_code": r["program_code"],
            "purposes_hash": r["purposes_hash"],
            "score": r["score"],
            "match_type": r["match_type"],
            "matched_keywords": keywords,
            "reasoning": r["reasoning"] or "",
            "model": r["model"],
        })

    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(
        json.dumps(items, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"✅ {len(items)}건 → {FIXTURE.relative_to(ROOT)}")
    print("   git add · commit · push 하면 팀원 pull만으로 판정 결과 반영됨.")


if __name__ == "__main__":
    main()
