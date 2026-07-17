"""축8 DeepSeek 실 판정 스모크 테스트.

목적:
  DeepSeek API 크레딧으로 축8 정합성 판정 end-to-end 검증.
  LLM 응답 품질·비용·재현성 실측 (Claude 결제 승인 대기 대체).

사용법:
  1. `.env` 파일에서 `DEEPSEEK_API_KEY=API_HERE` 를 실 값(sk-...)으로 교체
  2. 의존성 설치: `pip install openai python-dotenv pandas openpyxl pydantic`
  3. 실행: `python scripts/test_axis8_deepseek.py`

출력:
  - 연결 확인 hello
  - 파일럿 4건 실 판정 (score, match_type, keywords, reasoning + 소요시간)
  - 손판정 예상과 비교
  - 총 토큰 · 대략 비용 · $25 크레딧 대비 사용률
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "etl"))
sys.path.insert(0, str(ROOT / "backend" / "app"))

# .env 로드
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

try:
    from pydantic import ValidationError
except ImportError:
    sys.exit("pydantic 미설치. 실행: pip install pydantic")

# axis8_llm 프롬프트·스키마·헬퍼 재사용 (Claude 스텁이지만 SYSTEM_PROMPT 등은 provider 무관)
from services.axis8_llm import (
    SYSTEM_PROMPT,
    LLMAlignmentJudgment,
    _build_business_purpose_block,
    _build_support_block,
)

# ============================================================
# 설정
# ============================================================
MODEL = "deepseek-chat"                       # DeepSeek V3
BASE_URL = "https://api.deepseek.com/v1"

# DeepSeek 단가 (변동 가능 — https://api-docs.deepseek.com/quick_start/pricing 참조)
PRICE_INPUT_MISS_PER_1M = 0.14
PRICE_INPUT_HIT_PER_1M = 0.014
PRICE_OUTPUT_PER_1M = 0.28

CREDIT_USD = 25.0

# 파일럿 케이스 — EDA 발견한 대표 유형
# 사업목적 텍스트는 data1.xlsx 법인사업목적 시트에서 실 로드
PILOT_CASES = [
    {
        "company_id": 1178,
        "program_name": "스마트공장 구축 지원사업",
        "business_type": "스마트공장",
        "support_detail_main": "제품고도화",
        "description": "제조업 기업의 공정 자동화·데이터 기반 생산체계 구축 지원",
        "expected_type": "직접일치",
        "note": "밸브사가 스마트공장 지원 받는 대표 케이스. jaccard=0이지만 정합 예상 — LLM 필요성 실증",
    },
    {
        "company_id": 1786,
        "program_name": "소재부품 국산화 R&D",
        "business_type": "패키지지원",
        "support_detail_main": "제품고도화",
        "description": "국산화가 필요한 소재부품의 연구개발 지원",
        "expected_type": "간접관련",
        "note": "사업목적이 다각화(운동·컨설팅·제작·마케팅)인 기업. 개별 판정 어려움",
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
        "note": "인력양성은 대부분 업종에 관련됨 (범용 지원)",
    },
]

# ============================================================
# 데이터 로더
# ============================================================
def load_purposes(company_ids: list[int]) -> dict[int, list[str]]:
    """data1.xlsx 법인사업목적 시트에서 사업목적 텍스트 로드."""
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
# DeepSeek 호출
# ============================================================
def get_client() -> OpenAI:
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not key or key == "API_HERE":
        sys.exit(
            "❌ DEEPSEEK_API_KEY 미설정.\n"
            "  → .env 파일에서 DEEPSEEK_API_KEY=API_HERE 를 실 값(sk-...)으로 교체 필요"
        )
    return OpenAI(api_key=key, base_url=BASE_URL)


def hello(client: OpenAI) -> bool:
    """연결·인증 검증."""
    print("[hello] DeepSeek 연결 확인…")
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


SCHEMA_HINT = (
    "\n\n반드시 다음 JSON 스키마 그대로만 응답 (다른 텍스트 금지):\n"
    "{\n"
    '  "score": 0에서 100 사이 정수,\n'
    '  "match_type": "직접일치" 또는 "간접관련" 또는 "무관",\n'
    '  "matched_keywords": ["키워드1", "키워드2", "키워드3"],\n'
    '  "reasoning": "한 문장으로 근거 설명"\n'
    "}"
)


def judge(client: OpenAI, bp_block: str, support_block: str, max_retries: int = 2):
    """단일 판정 — JSON mode + Pydantic 검증. 실패 시 재시도."""
    user_content = f"{bp_block}\n\n{support_block}{SCHEMA_HINT}"
    last_err: Exception | None = None
    for attempt in range(max_retries + 1):
        r = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            max_tokens=1024,
            temperature=0.3,  # 재현성 위해 낮게
        )
        raw = r.choices[0].message.content or ""
        try:
            data = json.loads(raw)
            judgment = LLMAlignmentJudgment.model_validate(data)
            return judgment, r.usage
        except (json.JSONDecodeError, ValidationError) as e:
            last_err = e
            print(f"  ⚠️ attempt {attempt + 1} 검증 실패: {type(e).__name__}")
            if attempt == max_retries:
                print(f"  raw 응답: {raw[:400]}")
    raise RuntimeError(f"검증 최종 실패: {last_err}")


# ============================================================
# 메인
# ============================================================
def main() -> None:
    print(f"=== 축8 DeepSeek 스모크 테스트 (모델: {MODEL}) ===\n")

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
            print(f"  ❌ 판정 실패: {e}\n")
            continue

        print(f"\n  → score: {judgment.score}")
        print(f"  → match_type: {judgment.match_type}")
        print(f"  → matched_keywords: {judgment.matched_keywords}")
        print(f"  → reasoning: {judgment.reasoning}")
        print(f"  → tokens: input={usage.prompt_tokens} output={usage.completion_tokens} ({elapsed:.1f}s)")

        cache_hit = getattr(usage, "prompt_cache_hit_tokens", 0) or 0
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

    # 판정 태스크 1건당 평균 (본선 시나리오 시뮬용)
    if results:
        avg_input = total_input / len(results)
        avg_output = total_output / len(results)
        avg_cost = cost / len(results)
        print(f"판정 1건 평균: input={avg_input:.0f} output={avg_output:.0f} 비용=${avg_cost:.6f}")
        print(f"5000기업 · 판단유보 30% (예상 1500건) 환산: ${avg_cost * 1500:.4f}")


if __name__ == "__main__":
    main()
