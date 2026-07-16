"""축8 LLM 정합성 판정 서비스 — Phase 3 스텁 (결제 승인 후 활성화).

역할: Phase 2 whitelist 판정에서 `undetermined`/`unknown_ksic` 상태로 분류된 조합에
     대해 Claude API로 시맨틱 정합성 판정. structured output(Pydantic 검증)으로 반환.

핵심 원칙 (docs/축8_LLM_인터페이스.md):
- **default model = claude-opus-4-7** (claude-api 스킬 지침 · 팀 협의로 변경 가능)
- **2단 캐싱**: (1) 앱 레벨 dedup 캐시(같은 조합 재호출 방지) (2) Anthropic prompt cache
- **cache breakpoint 3개**: system 끝 · user content 첫 블록(사업목적) 끝
- **`ANTHROPIC_API_KEY` 미설정 시 NotImplementedError** — 실 호출 방지

활성화 순서 (결제 후):
1. `.env`에 `ANTHROPIC_API_KEY=sk-ant-...` 추가
2. `pip install -r backend/requirements.txt` (anthropic 이미 명시됨)
3. Phase 5 라우터가 `judge_alignment()` 호출
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

DEFAULT_MODEL = "claude-opus-4-7"
DEFAULT_EFFORT: Literal["low", "medium", "high", "max"] = "medium"
DEFAULT_MAX_TOKENS = 1024


class LLMAlignmentJudgment(BaseModel):
    """Structured output 스키마 — LLM 응답 자동 검증."""

    score: int = Field(ge=0, le=100)
    match_type: Literal["직접일치", "간접관련", "무관"]
    matched_keywords: list[str] = Field(default_factory=list, max_length=3)
    reasoning: str


@dataclass
class LLMCallMetrics:
    """비용 시뮬 검증용 usage 기록 (Phase 5에서 로깅)."""

    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int
    model: str


@dataclass
class LLMResult:
    judgment: LLMAlignmentJudgment
    metrics: LLMCallMetrics


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


# 앱 레벨 dedup 캐시 (Phase 5에서 SQLite/Redis 저장소로 승격)
_dedup_cache: dict[tuple[int, str, str], LLMAlignmentJudgment] = {}


def clear_dedup_cache() -> None:
    """테스트·재산정용."""
    _dedup_cache.clear()


def _call_claude(
    company_id: int,
    purposes: list[str],
    program_name: str,
    business_type: str,
    support_detail_main: str | None,
    description: str | None,
    model: str,
    effort: Literal["low", "medium", "high", "max"],
) -> LLMResult:
    """실 Claude 호출. ANTHROPIC_API_KEY 필요."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise NotImplementedError(
            "Phase 3 스텁 — ANTHROPIC_API_KEY 미설정. 결제 승인 후 환경변수 세팅 필요. "
            "설계: docs/축8_LLM_인터페이스.md · 비용: docs/축8_비용시뮬.md"
        )

    import anthropic

    client = anthropic.Anthropic()
    bp_block = _build_business_purpose_block(company_id, purposes)
    support_block = _build_support_block(
        program_name, business_type, support_detail_main, description
    )

    response = client.messages.parse(
        model=model,
        max_tokens=DEFAULT_MAX_TOKENS,
        thinking={"type": "adaptive"},
        output_config={"effort": effort},
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": bp_block,
                        "cache_control": {"type": "ephemeral"},
                    },
                    {"type": "text", "text": support_block},
                ],
            }
        ],
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
        ),
    )


def judge_alignment(
    *,
    company_id: int,
    business_purposes: list[str],
    program_code: str,
    program_name: str,
    business_type: str,
    support_detail_main: str | None = None,
    description: str | None = None,
    model: str = DEFAULT_MODEL,
    effort: Literal["low", "medium", "high", "max"] = DEFAULT_EFFORT,
) -> LLMAlignmentJudgment:
    """Public entrypoint — dedup 캐시 포함 판정.

    Phase 5 통합 시 axis8.classify_alignment이 needs_llm=True 반환한 케이스만 여기 위임.
    """
    if not business_purposes:
        # 사업목적 결측 → LLM에 물어봐도 근거 없음. 판정 불가.
        raise ValueError(f"company_id={company_id} business_purposes 비어있음")

    purposes_hash = hash_purposes(business_purposes)
    cache_key = (company_id, program_code, purposes_hash)

    hit = _dedup_cache.get(cache_key)
    if hit is not None:
        return hit

    result = _call_claude(
        company_id=company_id,
        purposes=business_purposes,
        program_name=program_name,
        business_type=business_type,
        support_detail_main=support_detail_main,
        description=description,
        model=model,
        effort=effort,
    )
    _dedup_cache[cache_key] = result.judgment
    return result.judgment


if __name__ == "__main__":
    # 스텁 동작 확인 — API 키 없이 호출하면 NotImplementedError
    try:
        judge_alignment(
            company_id=1178,
            business_purposes=["밸브 및 산업기계 제조업", "관련 기계장치 판매업"],
            program_code="TEST",
            program_name="스마트공장 구축 지원",
            business_type="스마트공장",
        )
    except NotImplementedError as e:
        print(f"[axis8_llm] 스텁 동작 정상: {e}")
    except ValueError as e:
        print(f"[axis8_llm] 입력 검증 정상: {e}")

    # 프롬프트 렌더링 확인
    print("\n--- SYSTEM PROMPT (첫 300자) ---")
    print(SYSTEM_PROMPT[:300], "...")
    print("\n--- 사업목적 블록 예시 ---")
    print(_build_business_purpose_block(1178, ["밸브·산업기계 제조", "관련 판매업"]))
    print("\n--- 지원사업 블록 예시 ---")
    print(_build_support_block("스마트공장 구축 지원", "스마트공장", "제품고도화", None))
    print("\n--- 캐시 키 예시 ---")
    print(f"  purposes_hash: {hash_purposes(['밸브·산업기계 제조', '관련 판매업'])}")
