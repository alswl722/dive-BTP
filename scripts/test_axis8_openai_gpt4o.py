"""축8 OpenAI 프리미엄 모델 (gpt-4o) 스모크 테스트.

목적:
  gpt-4o-mini에서 정확도 3/4 나왔던 케이스를 gpt-4o로 재판정.
  DeepSeek·gpt-4o-mini와 3자 비교로 최적 프로바이더/모델 확정.

가격 비교 (2026-04 캐시 기준, per 1M tokens):
  - DeepSeek V3:   input $0.14 (miss) / $0.014 (hit)   · output $0.28
  - gpt-4o-mini:   input $0.15 (miss) / $0.075 (hit)   · output $0.60
  - gpt-4o:        input $2.50 (miss) / $1.25 (hit)    · output $10.00     ← 이 스크립트

파일럿 4건 예상 비용: 약 $0.012 (gpt-4o-mini의 18배지만 절대값은 여전히 무시 수준)

사용법:
  기본: python scripts/test_axis8_openai_gpt4o.py
  다른 모델: OPENAI_MODEL=gpt-4.1 python scripts/test_axis8_openai_gpt4o.py
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
    print("⚠️ python-dotenv 미설치. 진행하지만 .env 자동 로드 안 됨.\n")

try:
    from openai import OpenAI
except ImportError:
    sys.exit("openai 미설치. 실행: pip install openai")

from services.axis8_llm import (
    SYSTEM_PROMPT,
    LLMAlignmentJudgment,
    _build_business_purpose_block,
    _build_support_block,
)

# ============================================================
# 설정 — env로 모델 오버라이드 가능
# ============================================================
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")

# 가격표 (per 1M tokens) — 모델별
PRICING = {
    "gpt-4o":        {"in_miss": 2.50, "in_hit": 1.25, "out": 10.00},
    "gpt-4o-mini":   {"in_miss": 0.15, "in_hit": 0.075, "out": 0.60},
    "gpt-4-turbo":   {"in_miss": 10.00, "in_hit": 5.00, "out": 30.00},
    "gpt-4.1":       {"in_miss": 2.00, "in_hit": 0.50, "out": 8.00},        # 참고용, 실 단가 확인 필요
}
PRICE = PRICING.get(MODEL, PRICING["gpt-4o"])   # 미등록 모델은 gpt-4o 가정
if MODEL not in PRICING:
    print(f"⚠️ {MODEL} 가격표 미등록. gpt-4o 단가로 추정 계산 (실제 비용 확인 필요)")

CREDIT_USD = 25.0

# 파일럿 케이스 — DeepSeek·gpt-4o-mini와 동일 (직접 비교)
PILOT_CASES = [
    {
        "company_id": 1178,
        "program_name": "스마트공장 구축 지원사업",
        "business_type": "스마트공장",
        "support_detail_main": "제품고도화",
        "description": "제조업 기업의 공정 자동화·데이터 기반 생산체계 구축 지원",
        "expected_type": "직접일치",
        "note": "밸브사 × 스마트공장 — jaccard=0. LLM 필요성 실증 케이스",
        "prior": {"deepseek": ("직접일치", 85), "gpt-4o-mini": ("직접일치", 71)},
    },
    {
        "company_id": 1786,
        "program_name": "소재부품 국산화 R&D",
        "business_type": "패키지지원",
        "support_detail_main": "제품고도화",
        "description": "국산화가 필요한 소재부품의 연구개발 지원",
        "expected_type": "무관",
        "note": "운동/건강 서비스 기업 × 소재부품 R&D",
        "prior": {"deepseek": ("무관", 15), "gpt-4o-mini": ("무관", 0)},
    },
    {
        "company_id": 117,
        "program_name": "기업 부설연구소 설립 지원",
        "business_type": "기술지원",
        "support_detail_main": None,
        "description": "R&D 조직 신설·확장 지원",
        "expected_type": "간접관련",
        "note": "제조·환경 엔지니어링 기업 × R&D 조직 지원",
        "prior": {"deepseek": ("간접관련", 50), "gpt-4o-mini": ("간접관련", 40)},
    },
    {
        "company_id": 1878,
        "program_name": "청년 창업 인력양성",
        "business_type": "일자리창출or인력양성",
        "support_detail_main": "고용확대",
        "description": "청년 대상 취업연계·인력양성",
        "expected_type": "무관",
        "note": "건축자재 제조 × 청년창업 프로그램. **DeepSeek와 gpt-4o-mini가 갈린 케이스**",
        "prior": {"deepseek": ("무관", 10), "gpt-4o-mini": ("간접관련", 40)},
    },
]

# ============================================================
# 데이터 로더
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
            "  → .env 파일에서 실 값(sk-proj-...)으로 교체 필요"
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
    """OpenAI structured output — Pydantic 자동 매핑."""
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
        refusal = response.choices[0].message.refusal or "unknown"
        raise RuntimeError(f"OpenAI parse 실패: refusal={refusal}")
    return parsed, response.usage


# ============================================================
# 메인
# ============================================================
def main() -> None:
    print(f"=== 축8 OpenAI 스모크 테스트 (모델: {MODEL}) ===")
    print(f"단가 (per 1M): input miss=${PRICE['in_miss']} hit=${PRICE['in_hit']} · output=${PRICE['out']}")
    print(f"파일럿 4건 예상 비용: 약 ${(4 * 900 * PRICE['in_miss'] + 4 * 100 * PRICE['out']) / 1_000_000:.4f}\n")

    client = get_client()

    if not hello(client):
        sys.exit(1)

    company_ids = [c["company_id"] for c in PILOT_CASES]
    purposes = load_purposes(company_ids)
    print(f"[load] 사업목적 로드: {len(purposes)}개 기업\n")

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
        prior = case["prior"]
        print(f"  기존 판정 — DeepSeek: {prior['deepseek'][0]}({prior['deepseek'][1]}) · "
              f"gpt-4o-mini: {prior['gpt-4o-mini'][0]}({prior['gpt-4o-mini'][1]})")

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

        print(f"\n  → {MODEL} 판정")
        print(f"     score: {judgment.score}")
        print(f"     match_type: {judgment.match_type}")
        print(f"     matched_keywords: {judgment.matched_keywords}")
        print(f"     reasoning: {judgment.reasoning}")
        print(f"     tokens: input={usage.prompt_tokens} output={usage.completion_tokens} ({elapsed:.1f}s)")

        cache_hit = 0
        details = getattr(usage, "prompt_tokens_details", None)
        if details is not None:
            cache_hit = getattr(details, "cached_tokens", 0) or 0
        if cache_hit:
            print(f"     cache hit: {cache_hit} tokens")

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
            "prior": prior,
        })
        print()

    # 요약
    print("=" * 60)
    print(f"=== {MODEL} 요약 ===\n")
    print(f"판정 완료: {len(results)}건")
    agree_count = sum(1 for r in results if r["agrees"])
    print(f"손판정 예상과 완전 일치: {agree_count}/{len(results)}")
    print()
    for r in results:
        mark = "✓" if r["agrees"] else "✗"
        print(f"  [{mark}] 기업 {r['company_id']:>5}: "
              f"예상={r['expected']:8} {MODEL}={r['actual']:8} score={r['score']:>3}")

    print()
    miss_tokens = total_input - total_cache_hit
    cost = (
        miss_tokens * PRICE["in_miss"] / 1_000_000
        + total_cache_hit * PRICE["in_hit"] / 1_000_000
        + total_output * PRICE["out"] / 1_000_000
    )
    print(f"총 토큰: input={total_input} (miss={miss_tokens}, cache_hit={total_cache_hit}) output={total_output}")
    print(f"실 비용: ${cost:.6f} ({cost / CREDIT_USD * 100:.5f}% of ${CREDIT_USD} 크레딧)")

    if results:
        avg_cost = cost / len(results)
        print(f"판정 1건 평균 비용: ${avg_cost:.6f}")
        print(f"5000기업 · 판단유보 30% (예상 1500건) 환산: ${avg_cost * 1500:.4f}")

    # 3자 비교표
    print()
    print("=" * 60)
    print("=== 3자 비교 (DeepSeek · gpt-4o-mini · " + MODEL + ") ===\n")
    print(f"{'기업':>6}  {'정답':<8}  {'DeepSeek':<15}  {'4o-mini':<15}  {MODEL:<15}")
    print("-" * 75)
    for r in results:
        ds = r["prior"]["deepseek"]
        mini = r["prior"]["gpt-4o-mini"]
        me = (r["actual"], r["score"])
        ds_mark = "✓" if ds[0] == r["expected"] else "✗"
        mini_mark = "✓" if mini[0] == r["expected"] else "✗"
        me_mark = "✓" if r["agrees"] else "✗"
        print(f"{r['company_id']:>6}  {r['expected']:<8}  "
              f"{ds_mark} {ds[0]}({ds[1]})".ljust(35)
              + f"{mini_mark} {mini[0]}({mini[1]})".ljust(20)
              + f"{me_mark} {me[0]}({me[1]})")

    print()
    print("=== 비용 비교 (5000기업 · 판단유보 30% 시나리오) ===")
    print("DeepSeek:     $0.1736")
    print("gpt-4o-mini:  $0.2497")
    if results:
        print(f"{MODEL:<13} ${cost * 1500 / len(results):.4f}")


if __name__ == "__main__":
    main()
