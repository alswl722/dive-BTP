"""축8 OpenAI GPT-4o-mini 실 판정 스모크 테스트.

목적:
  OpenAI API 크레딧으로 축8 정합성 판정 end-to-end 검증.
  DeepSeek 결과와 직접 비교 (동일 파일럿 케이스).

사용법:
  1. `.env` 파일에서 `OPENAI_API_KEY=API_HERE` 를 실 값(sk-proj-...)으로 교체
  2. 의존성 설치: `pip install openai python-dotenv pandas openpyxl pydantic`
  3. 실행: `python scripts/test_axis8_openai.py`

DeepSeek 대비 차이점:
  - `client.beta.chat.completions.parse()` 사용 → Pydantic 자동 매핑
    (JSON hint 프롬프트 불필요, 재시도 불필요)
  - base_url 지정 불필요 (기본값 openai)
  - Cache 자동 (prompt_tokens_details.cached_tokens에서 히트 조회)
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "etl"))
sys.path.insert(0, str(ROOT / "backend" / "app"))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    print("⚠️ python-dotenv 미설치. 진행하지만 .env 자동 로드 안 됨.")
    print("   설치: pip install python-dotenv\n")

try:
    from openai import OpenAI
except ImportError:
    sys.exit("openai 미설치. 실행: pip install openai")

# axis8_llm 프롬프트·스키마·헬퍼 재사용 (프로바이더 무관)
from services.axis8_llm import (
    SYSTEM_PROMPT,
    LLMAlignmentJudgment,
    _build_business_purpose_block,
    _build_support_block,
)

# ============================================================
# 설정
# ============================================================
MODEL = "gpt-4o-mini"                          # 축8용 default (한국어 판정 안정적, 저렴)

# OpenAI 단가 (2026-04 캐시 기준)
PRICE_INPUT_MISS_PER_1M = 0.15
PRICE_INPUT_HIT_PER_1M = 0.075                 # 캐시된 토큰은 50% 할인
PRICE_OUTPUT_PER_1M = 0.60

CREDIT_USD = 25.0

# DeepSeek 테스트와 동일 케이스 (직접 비교)
PILOT_CASES = [
    {
        "company_id": 1178,
        "program_name": "스마트공장 구축 지원사업",
        "business_type": "스마트공장",
        "support_detail_main": "제품고도화",
        "description": "제조업 기업의 공정 자동화·데이터 기반 생산체계 구축 지원",
        "expected_type": "직접일치",
        "note": "밸브사가 스마트공장 지원 — jaccard=0이지만 정합 예상 (LLM 필요성 실증)",
    },
    {
        "company_id": 1786,
        "program_name": "소재부품 국산화 R&D",
        "business_type": "패키지지원",
        "support_detail_main": "제품고도화",
        "description": "국산화가 필요한 소재부품의 연구개발 지원",
        "expected_type": "간접관련",
        "note": "다각화 사업목적. DeepSeek는 '무관' 판정했음. 두 모델 비교 지점",
    },
    {
        "company_id": 117,
        "program_name": "기업 부설연구소 설립 지원",
        "business_type": "기술지원",
        "support_detail_main": None,
        "description": "R&D 조직 신설·확장 지원",
        "expected_type": "간접관련",
        "note": "제조업이면 대체로 관련",
    },
    {
        "company_id": 1878,
        "program_name": "청년 창업 인력양성",
        "business_type": "일자리창출or인력양성",
        "support_detail_main": "고용확대",
        "description": "청년 대상 취업연계·인력양성",
        "expected_type": "간접관련",
        "note": "DeepSeek는 '무관' 판정. 청년 창업 대상 프로그램 vs 기존 제조업체 정합성",
    },
]

# ============================================================
# 데이터 로더 (DeepSeek 스크립트와 동일)
# ============================================================
def load_purposes(company_ids: list[int]) -> dict[int, list[str]]:
    p = ROOT / "data1.xlsx"
    if not p.exists():
        raise SystemExit(f"data1.xlsx 없음: {p}")
    df = pd.read_excel(p, sheet_name="4. 법인사업목적", header=2)
    df = df.rename(columns={
        "기업일련번호": "company_id",
        "사업목적항목내용": "purpose_text",
    })
    df = df.dropna(subset=["company_id", "purpose_text"])
    df["company_id"] = df["company_id"].astype(int)
    df = df[df["company_id"].isin(company_ids)]
    out: dict[int, list[str]] = {}
    for cid, sub in df.groupby("company_id"):
        out[int(cid)] = sub["purpose_text"].dropna().tolist()
    return out


# ============================================================
# OpenAI 호출
# ============================================================
def get_client() -> OpenAI:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key or key == "API_HERE":
        sys.exit(
            "❌ OPENAI_API_KEY 미설정.\n"
            "  → .env 파일에서 OPENAI_API_KEY=API_HERE 를 실 값(sk-proj-...)으로 교체 필요"
        )
    return OpenAI(api_key=key)


def hello(client: OpenAI) -> bool:
    print(f"[hello] OpenAI 연결 확인 (모델: {MODEL})…")
    try:
        r = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": "안녕. 한 문장으로 짧게 답해."}],
            max_tokens=50,
        )
        print(f"  응답: {r.choices[0].message.content.strip()}")
        print(f"  토큰: input={r.usage.prompt_tokens} output={r.usage.completion_tokens}\n")
        return True
    except Exception as e:
        print(f"  ❌ 실패: {type(e).__name__}: {e}\n")
        return False


def judge(client: OpenAI, bp_block: str, support_block: str):
    """OpenAI structured output — Pydantic 자동 매핑, JSON hint·재시도 불필요."""
    response = client.beta.chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{bp_block}\n\n{support_block}"},
        ],
        response_format=LLMAlignmentJudgment,
        max_tokens=1024,
        temperature=0.3,
    )
    parsed = response.choices[0].message.parsed
    if parsed is None:
        # 극히 드물지만 refusal 등으로 parsing 실패
        refusal = response.choices[0].message.refusal or "unknown"
        raise RuntimeError(f"OpenAI parse 실패: refusal={refusal}")
    return parsed, response.usage


# ============================================================
# 메인
# ============================================================
def main() -> None:
    print(f"=== 축8 OpenAI 스모크 테스트 (모델: {MODEL}) ===\n")

    client = get_client()

    if not hello(client):
        sys.exit(1)

    company_ids = [c["company_id"] for c in PILOT_CASES]
    purposes = load_purposes(company_ids)
    print(f"[load] 사업목적 로드: {len(purposes)}개 기업 (요청 {len(company_ids)}개)\n")

    total_input = 0
    total_output = 0
    total_cache_hit = 0
    results: list[dict] = []

    for case in PILOT_CASES:
        cid = case["company_id"]
        cases_purposes = purposes.get(cid, [])
        if not cases_purposes:
            print(f"[skip] 기업 {cid}: 사업목적 없음\n")
            continue

        print(f"--- 기업 {cid} ---")
        print(f"  사업목적 ({len(cases_purposes)}개):")
        for p in cases_purposes[:5]:
            snippet = str(p)[:70]
            print(f"    · {snippet}{'...' if len(str(p)) > 70 else ''}")
        if len(cases_purposes) > 5:
            print(f"    · ... 외 {len(cases_purposes) - 5}개")
        print(f"  지원사업: {case['program_name']} / {case['business_type']}")
        print(f"  손판정 예상: {case['expected_type']}")
        print(f"  참고: {case['note']}")

        bp_block = _build_business_purpose_block(cid, cases_purposes)
        support_block = _build_support_block(
            case["program_name"], case["business_type"],
            case["support_detail_main"], case["description"],
        )

        try:
            t0 = time.time()
            judgment, usage = judge(client, bp_block, support_block)
            elapsed = time.time() - t0
        except Exception as e:
            print(f"  ❌ 판정 실패: {type(e).__name__}: {e}\n")
            continue

        print(f"\n  → score: {judgment.score}")
        print(f"  → match_type: {judgment.match_type}")
        print(f"  → matched_keywords: {judgment.matched_keywords}")
        print(f"  → reasoning: {judgment.reasoning}")
        print(f"  → tokens: input={usage.prompt_tokens} output={usage.completion_tokens} ({elapsed:.1f}s)")

        cache_hit = 0
        details = getattr(usage, "prompt_tokens_details", None)
        if details is not None:
            cache_hit = getattr(details, "cached_tokens", 0) or 0
        if cache_hit:
            print(f"  → cache hit: {cache_hit} tokens")

        total_input += usage.prompt_tokens
        total_output += usage.completion_tokens
        total_cache_hit += cache_hit

        agrees = judgment.match_type == case["expected_type"]
        results.append({
            "company_id": cid,
            "expected": case["expected_type"],
            "actual": judgment.match_type,
            "score": judgment.score,
            "agrees": agrees,
        })
        print()

    # 요약
    print("=" * 50)
    print("=== 요약 ===\n")
    print(f"판정 완료: {len(results)}건")
    agree_count = sum(1 for r in results if r["agrees"])
    print(f"손판정 예상과 완전 일치: {agree_count}/{len(results)}")
    print()
    for r in results:
        mark = "✓" if r["agrees"] else "✗"
        print(f"  [{mark}] 기업 {r['company_id']:>5}: "
              f"예상={r['expected']:8} 실제={r['actual']:8} score={r['score']:>3}")

    print()
    miss_tokens = total_input - total_cache_hit
    cost = (
        miss_tokens * PRICE_INPUT_MISS_PER_1M / 1_000_000
        + total_cache_hit * PRICE_INPUT_HIT_PER_1M / 1_000_000
        + total_output * PRICE_OUTPUT_PER_1M / 1_000_000
    )
    print(f"총 토큰: input={total_input} (miss={miss_tokens}, cache_hit={total_cache_hit}) output={total_output}")
    print(f"대략 비용: ${cost:.6f} ({cost / CREDIT_USD * 100:.5f}% of ${CREDIT_USD} 크레딧)")
    print()

    if results:
        avg_input = total_input / len(results)
        avg_output = total_output / len(results)
        avg_cost = cost / len(results)
        print(f"판정 1건 평균: input={avg_input:.0f} output={avg_output:.0f} 비용=${avg_cost:.6f}")
        print(f"5000기업 · 판단유보 30% (예상 1500건) 환산: ${avg_cost * 1500:.4f}")

    print()
    print("=== DeepSeek 실측과 비교 (직접 대조) ===")
    print("DeepSeek: 판정 4건 · 총 $0.000463 · 1건평균 $0.000116 · 5000기업 환산 $0.1736")
    print(f"OpenAI:   판정 {len(results)}건 · 총 ${cost:.6f} · 1건평균 ${cost/len(results) if results else 0:.6f} · "
          f"5000기업 환산 ${cost * 1500 / len(results) if results else 0:.4f}")


if __name__ == "__main__":
    main()
