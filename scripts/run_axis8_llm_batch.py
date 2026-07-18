"""축8 LLM 실 판정 배치 — DB 판단유보 케이스 전부 처리.

용도:
  Phase 5b에서 build_business_fit()이 pending으로 넘긴 케이스를 실제 LLM
  판정으로 채워 DB 캐시 테이블에 저장. 다음 API 요청 시 companies.py가
  이 캐시를 조회해 pending → llm 상태로 승격.

사용법:
  # DB에 캐시 테이블 생성 (재실행 안전)
  # 이 스크립트가 자동 CREATE TABLE IF NOT EXISTS

  # 실행
  docker compose run --rm backend python /app/../scripts/run_axis8_llm_batch.py

  # 또는 로컬:
  python scripts/run_axis8_llm_batch.py

캐시 테이블 스키마:
  axis8_llm_cache (
    company_id INTEGER,
    program_code TEXT,
    purposes_hash TEXT,
    score INTEGER,
    match_type TEXT,
    matched_keywords TEXT,  -- JSON array
    reasoning TEXT,
    model TEXT,
    updated_at TIMESTAMPTZ
  )
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[1]
# 컨테이너 실행 시 /app이 backend 루트, 로컬 실행 시 backend 하위 디렉토리
for candidate in [Path("/app"), ROOT / "backend"]:
    if (candidate / "app" / "services" / "axis8.py").exists():
        sys.path.insert(0, str(candidate))
        break
for candidate in [Path("/app/etl"), ROOT / "backend" / "etl"]:
    if candidate.exists():
        sys.path.insert(0, str(candidate))
        break

# .env 로드 (있으면)
try:
    from dotenv import load_dotenv
    for env_path in [Path("/.env"), ROOT / ".env"]:
        if env_path.exists():
            load_dotenv(env_path)
            break
except ImportError:
    pass

from app.services import axis8 as axis8_svc
from app.services import axis8_llm as axis8_llm_svc

CACHE_DDL = """
CREATE TABLE IF NOT EXISTS axis8_llm_cache (
    company_id INTEGER NOT NULL,
    program_code TEXT NOT NULL,
    purposes_hash TEXT NOT NULL,
    score INTEGER,
    match_type TEXT NOT NULL,
    matched_keywords TEXT NOT NULL DEFAULT '[]',
    reasoning TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, program_code, purposes_hash)
);
"""


def get_engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        # 로컬 실행 시 localhost로 fallback (docker와 다름)
        url = "postgresql://foedev:foedev@localhost:5432/foedev"
    return create_engine(url)


def load_pending_cases(engine):
    """DB에서 판단유보 케이스 목록 조회.

    - support_records × companies × support_programs 조인
    - axis8.classify_alignment 실행해서 undetermined/unknown_ksic만 필터
    """
    with engine.connect() as conn:
        # 사업목적 by 기업
        bp = pd.read_sql_query(text("""
            SELECT company_id, purpose_text
            FROM company_business_purposes
            WHERE purpose_text IS NOT NULL
            ORDER BY company_id, seq
        """), conn)
        # 기업 KSIC
        comp = pd.read_sql_query(text("""
            SELECT company_id, ksic_code FROM companies
        """), conn)
        # 지원 레코드 (선정된 것만)
        sr = pd.read_sql_query(text("""
            SELECT sr.company_id, sr.year, sr.program_code, sr.business_type,
                   sr.support_detail_main,
                   sp.program_name, sp.description
            FROM support_records sr
            LEFT JOIN support_programs sp
              ON sr.year = sp.year AND sr.program_code = sp.program_code
            WHERE sr.selection_result = '지원대상'
        """), conn)

    purposes_by_id = bp.groupby("company_id")["purpose_text"].apply(list).to_dict()
    ksic_by_id = comp.set_index("company_id")["ksic_code"].to_dict()

    whitelist = axis8_svc.load_whitelist()
    accept = axis8_svc.load_accept_confidence()

    cases = []
    for _, r in sr.iterrows():
        cid = int(r["company_id"])
        result = axis8_svc.classify_alignment(
            ksic_by_id.get(cid), r["business_type"], whitelist, accept
        )
        if not result.needs_llm:
            continue
        cases.append({
            "company_id": cid,
            "purposes": purposes_by_id.get(cid, []),
            "program_code": str(r["program_code"]) if pd.notna(r["program_code"]) else "",
            "year": int(r["year"]) if pd.notna(r["year"]) else 0,
            "program_name": r["program_name"] if pd.notna(r["program_name"]) else None,
            "business_type": r["business_type"] if pd.notna(r["business_type"]) else None,
            "support_detail_main": r["support_detail_main"] if pd.notna(r["support_detail_main"]) else None,
            "description": r["description"] if pd.notna(r["description"]) else None,
        })
    return cases


def cache_hit(engine, cid: int, pcode: str, phash: str) -> bool:
    with engine.connect() as conn:
        r = conn.execute(text("""
            SELECT 1 FROM axis8_llm_cache
            WHERE company_id = :cid AND program_code = :pc AND purposes_hash = :ph
        """), {"cid": cid, "pc": pcode, "ph": phash}).fetchone()
    return r is not None


def save_judgment(engine, cid: int, pcode: str, phash: str, judgment, model: str):
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO axis8_llm_cache
                (company_id, program_code, purposes_hash, score, match_type,
                 matched_keywords, reasoning, model, updated_at)
            VALUES (:cid, :pc, :ph, :score, :mt, :mk, :rs, :model, now())
            ON CONFLICT (company_id, program_code, purposes_hash)
            DO UPDATE SET score = :score, match_type = :mt,
                          matched_keywords = :mk, reasoning = :rs,
                          model = :model, updated_at = now()
        """), {
            "cid": cid, "pc": pcode, "ph": phash,
            "score": judgment.score, "mt": judgment.match_type,
            "mk": json.dumps(judgment.matched_keywords, ensure_ascii=False),
            "rs": judgment.reasoning, "model": model,
        })


def main():
    engine = get_engine()

    print("== 캐시 테이블 준비 ==")
    with engine.begin() as conn:
        conn.execute(text(CACHE_DDL))

    print("\n== 판단유보 케이스 조회 ==")
    cases = load_pending_cases(engine)
    print(f"총 {len(cases)}건 대상\n")

    if not cases:
        print("판단유보 케이스 없음 (전부 whitelist 통과). 종료.")
        return

    total_input = total_output = total_hit = 0
    fresh_calls = 0
    skipped = 0
    failed = 0

    for i, c in enumerate(cases, 1):
        cid = c["company_id"]
        pcode = c["program_code"]
        phash = axis8_llm_svc.hash_purposes(c["purposes"])

        if cache_hit(engine, cid, pcode, phash):
            skipped += 1
            print(f"[{i}/{len(cases)}] {cid} · {pcode[:20]} → 캐시 hit, 스킵")
            continue

        print(f"[{i}/{len(cases)}] {cid} · {pcode[:20]} · {c['business_type']} → LLM 호출 중...", end=" ")
        try:
            t0 = time.time()
            result = axis8_llm_svc.judge_alignment_full(
                company_id=cid,
                business_purposes=c["purposes"],
                program_code=pcode,
                program_name=c["program_name"] or pcode,
                business_type=c["business_type"] or "-",
                support_detail_main=c["support_detail_main"],
                description=c["description"],
            )
            elapsed = time.time() - t0
            print(f"{result.judgment.match_type}({result.judgment.score}) · {elapsed:.1f}s")
            save_judgment(engine, cid, pcode, phash, result.judgment, result.metrics.model)
            total_input += result.metrics.input_tokens
            total_output += result.metrics.output_tokens
            total_hit += result.metrics.cache_read_input_tokens
            fresh_calls += 1
        except Exception as e:
            print(f"❌ {type(e).__name__}: {e}")
            failed += 1

    # 요약
    print("\n== 배치 완료 ==")
    print(f"신규 호출: {fresh_calls} · 캐시 스킵: {skipped} · 실패: {failed}")
    if fresh_calls:
        miss = total_input - total_hit
        # DeepSeek 단가 (deepseek-chat)
        cost = miss * 0.14 / 1e6 + total_hit * 0.014 / 1e6 + total_output * 0.28 / 1e6
        print(f"토큰: input={total_input} (miss={miss} hit={total_hit}) output={total_output}")
        print(f"대략 비용: ${cost:.6f}")


if __name__ == "__main__":
    main()
