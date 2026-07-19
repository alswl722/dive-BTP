"""축8 LLM 정합성 판정 서비스 — DeepSeek 기본, OpenAI·Claude는 옵션.

프로바이더:
  - deepseek (default) — 결제 완료. 파일럿 4건 정확도 4/4, 5000기업 시나리오 ~$0.17
  - openai — 결제 완료. gpt-4o 실측 4/4 (mini 3/4). 3~24배 비쌈
  - claude — 결제 대기. 승인 시 자동 활성화 가능 (Opus 4.7)

선택 방식:
  - AXIS8_LLM_PROVIDER env로 지정 ("deepseek" | "openai" | "claude")
  - 미지정 시 자동 감지: 유효 API 키가 있는 첫 프로바이더 (deepseek → openai → claude 순)

핵심 원칙 (docs/축8_LLM_인터페이스.md):
  - 규칙기반 whitelist 통과분(axis8.classify_alignment)은 LLM 미호출
  - LLM 대상은 status="undetermined"/"unknown_ksic" 케이스만
  - 2단 캐싱: 앱 레벨 dedup (company_id, program_code, purposes_hash) + 프로바이더 자동 prompt cache

호출 스타일:
  - DeepSeek: JSON mode (response_format={"type":"json_object"}) + Pydantic 수동 검증 + 재시도
  - OpenAI: client.beta.chat.completions.parse() — SDK 자동 매핑
  - Claude: client.messages.parse() (미구현 상태, 결제 후 활성화)
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from typing import Callable, Literal

from pydantic import BaseModel, Field, ValidationError

# ============================================================
# 상수 · 설정
# ============================================================
DEFAULT_PROVIDER_PRIORITY: list[str] = ["deepseek", "openai", "claude"]
DEFAULT_MODELS: dict[str, str] = {
    "deepseek": "deepseek-chat",
    "openai": "gpt-4o",
    "claude": "claude-opus-4-7",
}
KEY_ENV: dict[str, str] = {
    "deepseek": "DEEPSEEK_API_KEY",
    "openai": "OPENAI_API_KEY",
    "claude": "ANTHROPIC_API_KEY",
}
BASE_URL: dict[str, str | None] = {
    "deepseek": "https://api.deepseek.com/v1",
    "openai": None,          # SDK 기본 (https://api.openai.com/v1)
    "claude": None,          # anthropic SDK
}

DEFAULT_MAX_TOKENS = 1024
DEFAULT_EFFORT: Literal["low", "medium", "high", "max"] = "medium"


# ============================================================
# 스키마
# ============================================================
class LLMAlignmentJudgment(BaseModel):
    """Structured output — LLM 응답 자동 검증."""

    score: int = Field(ge=0, le=100)
    match_type: Literal["직접일치", "간접관련", "무관"]
    matched_keywords: list[str] = Field(default_factory=list, max_length=3)
    reasoning: str


@dataclass
class LLMCallMetrics:
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int
    model: str
    provider: str


@dataclass
class LLMResult:
    judgment: LLMAlignmentJudgment
    metrics: LLMCallMetrics


# ============================================================
# 프롬프트
# ============================================================
SYSTEM_PROMPT = """<role>
부산테크노파크 심사 담당자 지원 도구의 사업정체성 정합성 판정 assistant.
</role>

<task>
주어진 기업의 등기부등본 사업목적 텍스트와 실제 받은 정부 지원사업의 의미 정합성을
0~100 점수로 판정한다. 어휘 일치가 아닌 의미 일치를 본다.
</task>

<scoring_guide>
- 71~100 (직접일치): 사업목적 핵심 영역에 해당
- 31~70  (간접관련): 직접 서비스는 아니지만 사업목적 지원 가능
- 0~30   (무관):    사업목적과 지원사업 영역이 다름
</scoring_guide>

<output_rules>
- score: 0~100 정수
- match_type: "직접일치" | "간접관련" | "무관"
- matched_keywords: 정합성 근거가 되는 사업목적 텍스트 내 키워드 최대 3개
- reasoning: 담당자가 즉시 이해할 수 있는 한 문장
</output_rules>

<caution>
- 어휘 겹침 부재를 근거로 무관 판정 금지 (샘플에서 jaccard 평균 0.005 관측)
  예: "밸브·산업기계 제조" 사업목적 기업이 "스마트공장 구축 지원"을 받은 것은
     어휘 안 겹치지만 정합. score 71+ 부여 정상.
- 사업목적이 10개 항목으로 다각화된 경우 각 지원사업별 개별 판정, 관련된 항목만 근거로 인용
- 정보 부족 시 score 40~60 중립값 + reasoning에 부족 정보 명시
</caution>"""


# DeepSeek 등 JSON mode용 스키마 hint (SDK 자동 매핑 안 되는 프로바이더)
JSON_SCHEMA_HINT = """

반드시 다음 JSON 스키마 그대로만 응답 (다른 텍스트 금지):
{
  "score": 0에서 100 사이 정수,
  "match_type": "직접일치" 또는 "간접관련" 또는 "무관",
  "matched_keywords": ["키워드1", "키워드2", "키워드3"],
  "reasoning": "한 문장으로 근거 설명"
}"""


# ============================================================
# 프롬프트 조립 헬퍼
# ============================================================
def _build_business_purpose_block(company_id: int, purposes: list[str]) -> str:
    """캐시 대상 블록 — 기업당 write 1회 후 read."""
    lines = [f"<company id={company_id}>", "<business_purposes>"]
    for i, p in enumerate(purposes, 1):
        lines.append(f"  {i}. {p}")
    lines.append("</business_purposes>")
    lines.append("</company>")
    return "\n".join(lines)


def _build_support_block(
    program_name: str,
    business_type: str,
    support_detail_main: str | None,
    description: str | None,
) -> str:
    """가변부 (캐시 안 함)."""
    lines = ["다음 지원사업과 위 사업목적의 정합성을 판정해줘.", "", "<support_program>"]
    lines.append(f"  사업명: {program_name}")
    lines.append(f"  business_type: {business_type}")
    if support_detail_main:
        lines.append(f"  세부구분: {support_detail_main}")
    if description:
        lines.append(f"  설명: {description}")
    lines.append("</support_program>")
    return "\n".join(lines)


def hash_purposes(purposes: list[str]) -> str:
    """사업목적 정렬 후 SHA-256 12자 — dedup 키·프롬프트 캐시 방어."""
    joined = "\n".join(sorted(purposes))
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:12]


# 앱 레벨 dedup 캐시 — (company_id, program_code, purposes_hash) → judgment
_dedup_cache: dict[tuple[int, str, str], LLMAlignmentJudgment] = {}


def clear_dedup_cache() -> None:
    _dedup_cache.clear()


# ============================================================
# 프로바이더 선택
# ============================================================
def _has_valid_key(env_name: str) -> bool:
    v = os.environ.get(env_name, "").strip()
    return bool(v) and v != "API_HERE"


def _detect_provider(explicit: str | None = None) -> str:
    """AXIS8_LLM_PROVIDER env 우선, 없거나 무효 시 자동 감지."""
    candidate = (explicit or os.environ.get("AXIS8_LLM_PROVIDER", "")).strip().lower()
    if candidate in DEFAULT_MODELS and _has_valid_key(KEY_ENV[candidate]):
        return candidate
    # 자동 감지 — DEFAULT_PROVIDER_PRIORITY 순으로 유효 키 있는 첫 프로바이더
    for prov in DEFAULT_PROVIDER_PRIORITY:
        if _has_valid_key(KEY_ENV[prov]):
            return prov
    raise NotImplementedError(
        "축8 LLM 판정 활성화 필요 — DEEPSEEK_API_KEY / OPENAI_API_KEY / "
        "ANTHROPIC_API_KEY 중 하나 세팅 (.env 파일)"
    )


# ============================================================
# 프로바이더별 호출 함수
# ============================================================
def _call_deepseek(
    bp_block: str,
    support_block: str,
    model: str,
    max_retries: int = 2,
) -> LLMResult:
    """DeepSeek OpenAI-호환 API 호출 (JSON mode + Pydantic 검증 + 재시도)."""
    from openai import OpenAI  # lazy import — 의존성 격리

    client = OpenAI(
        api_key=os.environ["DEEPSEEK_API_KEY"],
        base_url=BASE_URL["deepseek"],
    )
    user_content = f"{bp_block}\n\n{support_block}{JSON_SCHEMA_HINT}"

    last_err: Exception | None = None
    for attempt in range(max_retries + 1):
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            max_tokens=DEFAULT_MAX_TOKENS,
            temperature=0.3,
        )
        raw = response.choices[0].message.content or ""
        try:
            data = json.loads(raw)
            judgment = LLMAlignmentJudgment.model_validate(data)
            cache_hit = getattr(response.usage, "prompt_cache_hit_tokens", 0) or 0
            return LLMResult(
                judgment=judgment,
                metrics=LLMCallMetrics(
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    cache_read_input_tokens=cache_hit,
                    cache_creation_input_tokens=0,
                    model=model,
                    provider="deepseek",
                ),
            )
        except (json.JSONDecodeError, ValidationError) as e:
            last_err = e
            if attempt == max_retries:
                raise RuntimeError(
                    f"DeepSeek 응답 검증 실패 ({max_retries + 1}회 시도): {e}. "
                    f"raw={raw[:200]}"
                )
    raise RuntimeError(f"unreachable: {last_err}")


def _call_openai(
    bp_block: str,
    support_block: str,
    model: str,
) -> LLMResult:
    """OpenAI structured output — SDK 자동 Pydantic 매핑, 재시도 불필요."""
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{bp_block}\n\n{support_block}"},
        ],
        response_format=LLMAlignmentJudgment,
        max_tokens=DEFAULT_MAX_TOKENS,
        temperature=0.3,
    )
    parsed = response.choices[0].message.parsed
    if parsed is None:
        refusal = response.choices[0].message.refusal or "unknown"
        raise RuntimeError(f"OpenAI parse 실패: refusal={refusal}")

    details = getattr(response.usage, "prompt_tokens_details", None)
    cache_hit = getattr(details, "cached_tokens", 0) or 0 if details else 0
    return LLMResult(
        judgment=parsed,
        metrics=LLMCallMetrics(
            input_tokens=response.usage.prompt_tokens,
            output_tokens=response.usage.completion_tokens,
            cache_read_input_tokens=cache_hit,
            cache_creation_input_tokens=0,
            model=model,
            provider="openai",
        ),
    )


def _call_claude(
    bp_block: str,
    support_block: str,
    model: str,
    effort: Literal["low", "medium", "high", "max"] = DEFAULT_EFFORT,
) -> LLMResult:
    """Claude Anthropic SDK — 결제 완료 시 활성화.

    docs/축8_비용시뮬.md 참조. 현재 결제 대기라 실 환경에서는 다다르지 않음.
    """
    import anthropic  # type: ignore[import]

    client = anthropic.Anthropic()
    response = client.messages.parse(
        model=model,
        max_tokens=DEFAULT_MAX_TOKENS,
        thinking={"type": "adaptive"},
        output_config={"effort": effort},
        system=[{
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": bp_block,
                    "cache_control": {"type": "ephemeral"},
                },
                {"type": "text", "text": support_block},
            ],
        }],
        output_format=LLMAlignmentJudgment,
    )
    return LLMResult(
        judgment=response.parsed_output,
        metrics=LLMCallMetrics(
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cache_read_input_tokens=response.usage.cache_read_input_tokens or 0,
            cache_creation_input_tokens=response.usage.cache_creation_input_tokens or 0,
            model=model,
            provider="claude",
        ),
    )


# 프로바이더 dispatch
_PROVIDER_FN: dict[str, Callable[..., LLMResult]] = {
    "deepseek": _call_deepseek,
    "openai": _call_openai,
    "claude": _call_claude,
}


# ============================================================
# Public entrypoint
# ============================================================
def judge_alignment(
    *,
    company_id: int,
    business_purposes: list[str],
    program_code: str,
    program_name: str,
    business_type: str,
    support_detail_main: str | None = None,
    description: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> LLMAlignmentJudgment:
    """dedup 캐시 포함 판정 — Phase 5 통합 시 axis8.classify_alignment의
    needs_llm=True 케이스만 여기 위임."""
    if not business_purposes:
        raise ValueError(f"company_id={company_id} business_purposes 비어있음")

    purposes_hash = hash_purposes(business_purposes)
    cache_key = (company_id, program_code, purposes_hash)
    hit = _dedup_cache.get(cache_key)
    if hit is not None:
        return hit

    prov = _detect_provider(provider)
    mdl = model or DEFAULT_MODELS[prov]
    call_fn = _PROVIDER_FN[prov]

    bp_block = _build_business_purpose_block(company_id, business_purposes)
    support_block = _build_support_block(
        program_name, business_type, support_detail_main, description
    )

    result = call_fn(bp_block, support_block, mdl)
    _dedup_cache[cache_key] = result.judgment
    return result.judgment


def judge_alignment_full(
    *,
    company_id: int,
    business_purposes: list[str],
    program_code: str,
    program_name: str,
    business_type: str,
    support_detail_main: str | None = None,
    description: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> LLMResult:
    """judge_alignment와 동일하지만 usage metrics도 반환 (비용 로깅용)."""
    if not business_purposes:
        raise ValueError(f"company_id={company_id} business_purposes 비어있음")

    prov = _detect_provider(provider)
    mdl = model or DEFAULT_MODELS[prov]
    call_fn = _PROVIDER_FN[prov]

    bp_block = _build_business_purpose_block(company_id, business_purposes)
    support_block = _build_support_block(
        program_name, business_type, support_detail_main, description
    )
    result = call_fn(bp_block, support_block, mdl)
    cache_key = (company_id, program_code, hash_purposes(business_purposes))
    _dedup_cache[cache_key] = result.judgment
    return result


# ============================================================
# 스모크 테스트 (standalone: `python axis8_llm.py`)
# ============================================================
if __name__ == "__main__":
    # .env 로드 (선택)
    try:
        from dotenv import load_dotenv
        from pathlib import Path
        load_dotenv(Path(__file__).resolve().parents[3] / ".env")
    except ImportError:
        pass

    print("=== axis8_llm 스모크 테스트 ===")
    print(f"환경 감지:")
    for prov, key_env in KEY_ENV.items():
        valid = _has_valid_key(key_env)
        mark = "✓" if valid else "✗"
        print(f"  [{mark}] {prov:8} ({key_env})")

    try:
        prov = _detect_provider()
        print(f"\n선택된 프로바이더: {prov} (모델: {DEFAULT_MODELS[prov]})")
    except NotImplementedError as e:
        print(f"\n프로바이더 감지 실패: {e}")
        raise SystemExit(0)

    # 실 호출 — 결제된 프로바이더가 있으면 진행
    print("\n실 판정 테스트 (기업 1178: 밸브사 × 스마트공장):")
    try:
        result = judge_alignment_full(
            company_id=1178,
            business_purposes=[
                "밸브제조", "밸브판매", "밸브수리",
                "각호에 부대되는 일체의 사업",
            ],
            program_code="TEST_SMART",
            program_name="스마트공장 구축 지원사업",
            business_type="스마트공장",
            support_detail_main="제품고도화",
            description="제조업 공정 자동화·데이터 기반 생산체계 구축 지원",
        )
        print(f"  score: {result.judgment.score}")
        print(f"  match_type: {result.judgment.match_type}")
        print(f"  matched_keywords: {result.judgment.matched_keywords}")
        print(f"  reasoning: {result.judgment.reasoning}")
        print(f"  provider={result.metrics.provider} model={result.metrics.model}")
        print(f"  tokens: input={result.metrics.input_tokens} "
              f"output={result.metrics.output_tokens} "
              f"cache_hit={result.metrics.cache_read_input_tokens}")

        # dedup 캐시 검증 — 같은 판정 재호출 시 캐시 히트
        print("\n동일 케이스 재호출 (dedup 캐시 검증):")
        r2 = judge_alignment(
            company_id=1178,
            business_purposes=[
                "밸브제조", "밸브판매", "밸브수리",
                "각호에 부대되는 일체의 사업",
            ],
            program_code="TEST_SMART",
            program_name="스마트공장 구축 지원사업",
            business_type="스마트공장",
        )
        print(f"  캐시에서 즉시 반환: score={r2.score} (API 재호출 없음)")
    except Exception as e:
        print(f"  ❌ 실패: {type(e).__name__}: {e}")
