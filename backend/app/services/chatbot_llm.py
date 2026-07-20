"""심사 챗봇 LLM — 자연어 질문 → 의도 분류(navigate·query·clarify) → 안전 SELECT SQL → 결과 요약.

축8과 같은 DeepSeek V3 (deepseek-chat) 재사용. 3가지 종류의 질문을 한 번의 LLM
호출로 분류하고 필요한 필드(path 또는 sql)를 함께 생성한다:

  1) classify_intent(question) — 스키마 요약 + 라우트 화이트리스트 + 질문
        → {kind: navigate|query|clarify, path?, sql?, clarification?}
     - navigate: 화면 이동 (services/chatbot.py 경로 화이트리스트 검증)
     - query:    DB 조회 SQL (validate_sql 검증 후 실행)
     - clarify:  둘 다 아닌 경우 사유 안내
  2) summarize(question, sql, rows) — query 경로에서만 호출

핵심 원칙 (CLAUDE.md 페르소나 · 축8 원칙 상속):
  - 담당자가 이미 화면에서 확인 가능한 값만 답한다(신규 예측 금지)
  - SQL은 화이트리스트 테이블만 · SELECT만 · LIMIT 강제(services/chatbot.py 검증)
  - navigate 경로도 화이트리스트만 — 외부 URL·상대경로 우회 방지
  - LLM은 의도·SQL·경로만 만든다. 실행·검증·통계 요약은 코드에서
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError


# ============================================================
# 스키마 요약 프롬프트 — 자동 캐시 대상(반복 호출 시 read-only)
# ============================================================
# 컬럼명·단위·조인 관계까지 압축해 담는다. LLM이 잘못된 조인·단위 착각을
# 하지 않도록 "⚠️" 표시로 CLAUDE.md 알려진 이슈를 노출.
SCHEMA_DOC = """다음은 PostgreSQL 스키마 요약이다. 이 스키마만 사용해 SQL을 만든다.

## companies — 기업 기본정보 (PK: company_id)
- company_id INT, region TEXT (지역), founded_date DATE
- corp_type TEXT (법인/개인), company_size TEXT (대/중/소)
- listing_type TEXT (코스피/코스닥/비상장), corp_form TEXT
- ksic_code TEXT (⚠️ KSIC 11차 알파벳+숫자, 업종 그룹핑은 항상 이 컬럼)
- industry_name TEXT, main_products TEXT, company_status TEXT
- researcher_count_recent INT, has_research_institute BOOL, has_research_dept BOOL
- is_closed BOOL, closed_date DATE

## company_yearly_metrics — 연도별 재무·특허 (PK: company_id, year)
- year INT (2020~2024)
- employee_count INT (종업원수)
- avg_annual_salary_krw NUMERIC ⚠️ 이 컬럼만 단위=원, 나머지 금액은 전부 천원
- revenue_thousand_krw NUMERIC (매출액, 천원)
- operating_profit_thousand_krw (영업이익), net_income_thousand_krw (당기순이익)
- total_assets_thousand_krw, total_liabilities_thousand_krw, total_equity_thousand_krw
- rnd_expense_thousand_krw (연구개발비)
- operating_margin_pct NUMERIC (영업이익률, 이미 % 값)
- patents_registered_cum, patents_applied_cum INT
   ⚠️ 특허 누적건수 컬럼은 비단조(flow 오염)이므로 정확한 특허 집계는 patents 원장 사용

## company_certifications — 인증 보유 (PK: company_id, cert_type)
- cert_type TEXT ('이노비즈' | '메인비즈' | '벤처기업' | '소재부품' | 'NET' | 'NEP')
- has_cert BOOL

## patents — 특허·실용신안 원장
- company_id, ip_type TEXT ('특허권' | '실용신안권' | '상표권' | '디자인권')
- reg_status TEXT, applied_date DATE, registered_date DATE, is_valid BOOL
   → 특허 건수는 WHERE ip_type IN ('특허권','실용신안권')로 걸러야 정확

## ntis_lead_projects — NTIS 주관 R&D (정부과제)
- company_id, base_year INT, base_date DATE
- project_name, ministry, tech_classification TEXT
- period_start_date, period_end_date DATE
- gov_funding_krw, total_funding_krw NUMERIC (단위=원)

## ntis_consigned_projects — NTIS 위탁 R&D
- company_id, base_year, consigned_funding_krw NUMERIC
- foreign_joint_research, university_joint_research, public_joint_research BOOL

## company_business_purposes — 등기부 사업목적 (PK: company_id, seq)
- purpose_text TEXT, registered_date DATE

## support_programs — 부산TP 사업 목록 (PK: year, program_code)
- year INT, program_code TEXT, program_name TEXT
- macro_category TEXT (RnD/복합/기업지원)
- business_type TEXT (사업유형), start_date, end_date DATE
- ministry TEXT (부처), local_gov TEXT, description TEXT

## support_records — 부산TP 실제 선정·신청 원장
- id, year, program_code, company_id (companies FK)
- business_type, support_detail_main TEXT, support_item TEXT
- selected_date DATE
- selection_result TEXT ('지원대상' | '탈락' | '포기') ← '지원대상' = 실제 선정
- support_amount_thousand_krw NUMERIC (지원금, 천원, NULL=미기재)
- region_wide, region_base TEXT

## master_table — 팀 공용 뷰 (기업 1행 와이드). 컬럼명이 한글이라 큰따옴표 필수.
- "기업일련번호", "지역", "KSIC코드(11차)", "업종명(11차)", "기업규모"
- "매출액_YYYY" (2020~2024, 천원), "종업원수_YYYY"
- "이노비즈", "벤처기업" 등 BOOL
- "지원건수" INT, "총지원금_천원" NUMERIC
   → 한 기업의 요약 지표는 이 뷰 한 방으로 잡히면 조인 안 짜도 됨

## data_quality_flags — 데이터 품질 경고 뷰 (support_records 1건 = 1행, 기업당 1행 아님)
- support_record_id, company_id, year, program_code  ← ⚠️ id 컬럼 없음. PK 자리는 support_record_id
- missing_fields TEXT[] — 가능한 값은 6종뿐:
  지원금결측 / 시작일결측 / 종료일결측 / 업종코드결측 / 주생산품결측 / 설립연도결측
- ⚠️ 결측이 하나도 없는 행도 빈 배열({})로 뷰에 들어있다.
  경고 건수를 셀 때는 반드시 cardinality(missing_fields) > 0 조건을 건다.
- "경고 N개인 기업"처럼 기업 단위를 물으면 지원레코드를 기업으로 집계해야 한다:
  SELECT company_id, COUNT(*) AS 경고건수 FROM data_quality_flags
  WHERE cardinality(missing_fields) > 0 GROUP BY company_id HAVING COUNT(*) = N
  (한 레코드 안의 결측 필드 개수를 묻는 경우는 cardinality(missing_fields) = N)

## company_review_status — 심사 찜 상태 (PK: company_id)
- status TEXT ('후보' | '선정' | '보류' | '제외')

## notes / note_mentions — 심사 메모
- notes(id, body, author, created_at)
- note_mentions(note_id, target_type ('company'|'program'), company_id, program_year, program_code)

## 조인 팁
- 기업 통합: SELECT ... FROM companies c LEFT JOIN master_table mt ON mt."기업일련번호" = c.company_id
- 반복선정 랭킹: SELECT company_id, COUNT(*) FROM support_records WHERE selection_result='지원대상' GROUP BY company_id HAVING COUNT(*) >= N
- 사업별 선정기업수: SELECT year, program_code, COUNT(DISTINCT company_id) FROM support_records WHERE selection_result='지원대상' GROUP BY 1,2
"""

ROUTES_DOC = """다음 경로 화이트리스트만 navigate에 사용 가능하다 (그 외 URL·외부 링크 금지).

## 앱 페이지
- `/`                    — 메인 대시보드(홈)
- `/companies`           — 기업 선정 목록(전체 기업 표·보드)
- `/companies/{id}`      — 특정 기업 상세 스코어카드 ({id}는 정수 company_id)
- `/programs`            — 지원사업 목록
- `/programs?year={y}&program={code}` — 특정 사업 상세 패널 열기 (year+code 둘 다 필요)
- `/notes`               — 심사 메모 목록
- `/selected`            — 심사에서 '선정' 상태로 표시한 기업 모음
- `/duplicates`          — 중복지원(반복선정) 탐지 화면
- `/compare`             — 기업 비교 (미리 선택한 기업 없으면 안내 화면)

## 언제 navigate를 쓰나
- "기업 1049 상세" / "1049번 기업 열어줘" → `/companies/1049`
- "지원사업 목록" / "사업 화면" → `/programs`
- "홈으로" / "메인으로" → `/`
- "메모 페이지" → `/notes`
- "선정된 기업들" → `/selected`
- "중복지원 화면" → `/duplicates`

## 언제 query를 쓰나
- 데이터 조회로 답 나오는 질문 ("매출 상위 5개", "벤처 인증 보유 기업")
- 데이터를 봐야 대상 id를 알 수 있는 경우 (예: "가장 매출 높은 기업 열어줘")도
  일단 query로 처리 — 사용자가 결과 표에서 id 확인 후 다시 navigate 요청

## 언제 clarify를 쓰나
- 인사 / 잡담 ("안녕", "고마워")
- 앱 기능 밖 요청 ("이메일 보내줘", "코드 짜줘")
- 스키마·경로 어디에도 매핑 안 되는 요청"""


SYSTEM_PROMPT_INTENT = f"""<role>
부산테크노파크 심사 담당자 지원 도구의 조회·조작 챗봇. 담당자가 여러 화면을
클릭하며 확인해야 할 정보를 자연어로 대신 조회하거나, 특정 화면으로 바로 이동시킨다.
</role>

<schema>
{SCHEMA_DOC}
</schema>

<routes>
{ROUTES_DOC}
</routes>

<rules_query>
- 반드시 SELECT 단일 문장만 생성한다 (WITH 절 허용). INSERT/UPDATE/DELETE/DDL 금지.
- 세미콜론(;) 붙이지 말 것. SQL 주석(--, /* */) 금지.
- 결과는 반드시 LIMIT 절을 포함(사용자가 명시 안 하면 LIMIT 20).
- 위 스키마에 없는 테이블·컬럼 사용 금지.
- 한글 컬럼(master_table)은 반드시 큰따옴표. 예: mt."매출액_2024"
- 단위 주의: avg_annual_salary_krw만 원, 나머지 금액은 천원. 결과에 단위를 절대 섞지 말 것.
- ⚠️ 재무 지표를 세로/가로 비교할 때 반드시 단위를 컬럼 alias에 명시(예: "매출액_천원").
- 사업유형·지역·인증 등 카테고리형은 부분일치(ILIKE) 우선.
- 회사 이름을 물으면 이 스키마에는 회사명이 없으므로 company_id로 답한다(프론트가 이름을 붙임).
</rules_query>

<rules_navigate>
- path는 반드시 <routes>에 열거된 형태 그대로. 다른 URL·외부링크 금지.
- 기업 id가 명시적으로 안 나오면 navigate 대신 query로 후보를 먼저 조회한다.
- 사업 상세(year+code)가 둘 다 없으면 `/programs` 목록 페이지로만 이동.
</rules_navigate>

<output>
JSON 한 개만 응답. 다른 텍스트 금지:
{{
  "kind": "navigate" | "query" | "clarify",
  "intent": "이 질문을 이렇게 해석했다는 한 문장",
  "path": "/companies/1049",             // kind=navigate일 때만
  "sql": "SELECT ... LIMIT 20",          // kind=query일 때만
  "clarification": "요청 처리 불가 사유"  // kind=clarify일 때만
}}
</output>"""

SYSTEM_PROMPT_SUMMARY = """<role>
부산테크노파크 심사 담당자 지원 도구의 답변 생성기. 사용자 질문과 SQL 실행
결과(JSON rows)를 받아 담당자가 바로 이해할 수 있는 한/두 문장 답변을 만든다.
</role>

<rules>
- 결과 표는 UI가 따로 표시하므로 답변에서 표를 그리지 말 것.
- 결과 건수(총 몇 건)와 상위 인사이트만 짚는다. 예: "총 5개 기업이 조건을 만족합니다. 상위는 1049, 1178입니다."
- 결과가 0건이면 조건을 재확인하도록 안내(가정을 재검토, 필터 완화 제안).
- 재무 금액은 결과가 천원 단위면 "약 X억원" 등 사람이 읽기 좋은 단위로 환산.
  (avg_annual_salary_krw는 원 단위, 나머지 *_thousand_krw는 천원 단위)
- 회사 이름은 이 시스템에 없으므로 "기업 1049" 식으로 id로 지칭.
- 결과가 없거나 이상하면 SQL이나 컬럼명을 언급하지 말고 "조건을 만족하는 기업이 없습니다" 정도로.
- 답변은 3문장을 넘기지 않는다.
</rules>

<output>
평문(마크다운 없음). 다른 감상평·불필요한 서두 금지.
</output>"""


# ============================================================
# 스키마 (LLM 응답 검증)
# ============================================================
class IntentResult(BaseModel):
    """LLM 응답 통합 스키마 — kind에 따라 채워지는 필드가 다르다."""

    kind: Literal["navigate", "query", "clarify"]
    intent: str
    path: str = ""            # kind=navigate에서만
    sql: str = ""             # kind=query에서만
    clarification: str = ""   # kind=clarify에서만


@dataclass
class LLMCallMetrics:
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    model: str
    provider: str


# ============================================================
# 프로바이더 (axis8_llm과 같은 구조 — 자동 감지)
# ============================================================
DEFAULT_PROVIDER = "deepseek"
DEFAULT_MODEL = "deepseek-chat"
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
KEY_ENV = "DEEPSEEK_API_KEY"


def _has_key() -> bool:
    v = os.environ.get(KEY_ENV, "").strip()
    return bool(v) and v != "API_HERE"


def is_available() -> bool:
    """챗봇 활성화 가능 여부 — 라우터가 503 반환 판단에 사용."""
    return _has_key()


def _client():
    from openai import OpenAI  # lazy import
    return OpenAI(api_key=os.environ[KEY_ENV], base_url=DEEPSEEK_BASE_URL)


# ============================================================
# Step 1 — 자연어 → 의도 분류 + (SQL 또는 path)
# ============================================================
def classify_intent(
    question: str,
    *,
    max_retries: int = 1,
    prior_sql: str | None = None,
    prior_error: str | None = None,
) -> tuple[IntentResult, LLMCallMetrics]:
    """질문 → navigate|query|clarify 분류 + 필요한 필드(path/sql/clarification) 채움.

    prior_sql/prior_error가 오면 직전 SQL 시도가 DB에서 실패했다는 뜻 —
    실패한 SQL과 에러 원문을 붙여 kind=query로 재작성을 요구한다
    (컬럼명 환각 자가 수정용).
    """
    if not question.strip():
        raise ValueError("질문이 비어있습니다.")

    user_content = question.strip()
    if prior_sql and prior_error:
        user_content = (
            f"{user_content}\n\n"
            f"<previous_attempt_failed>\n"
            f"직전에 생성한 SQL:\n{prior_sql}\n\n"
            f"DB 에러:\n{prior_error}\n\n"
            f"이 에러의 원인이 된 테이블·컬럼을 <schema>에서 다시 확인하고, "
            f"스키마에 실제로 있는 컬럼만 써서 SQL을 새로 작성하라. "
            f"스키마에 그런 컬럼이 없으면 kind='clarify'로 안내하라.\n"
            f"</previous_attempt_failed>"
        )

    client = _client()
    last_err: Exception | None = None
    for attempt in range(max_retries + 1):
        resp = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_INTENT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            max_tokens=800,
            temperature=0.1,
        )
        raw = resp.choices[0].message.content or ""
        try:
            data = json.loads(raw)
            parsed = IntentResult.model_validate(data)
            metrics = LLMCallMetrics(
                input_tokens=resp.usage.prompt_tokens,
                output_tokens=resp.usage.completion_tokens,
                cache_read_input_tokens=getattr(resp.usage, "prompt_cache_hit_tokens", 0) or 0,
                model=DEFAULT_MODEL,
                provider=DEFAULT_PROVIDER,
            )
            return parsed, metrics
        except (json.JSONDecodeError, ValidationError) as e:
            last_err = e
            if attempt == max_retries:
                raise RuntimeError(
                    f"DeepSeek 의도 분류 응답 검증 실패 ({max_retries + 1}회 시도): {e}. "
                    f"raw={raw[:200]}"
                )
    raise RuntimeError(f"unreachable: {last_err}")


# ============================================================
# Step 2 — 결과 요약
# ============================================================
def summarize(
    question: str,
    sql: str,
    rows: list[dict[str, Any]],
    columns: list[str],
) -> tuple[str, LLMCallMetrics]:
    """실행 결과 → 담당자용 한/두 문장. 표 자체는 UI가 렌더링."""
    client = _client()

    # 결과가 크면 앞 30건만 요약에 넘긴다 (토큰 · 프라이버시 · 요약 품질)
    sample = rows[:30]
    payload = {
        "question": question,
        "row_count": len(rows),
        "columns": columns,
        "rows_sample": sample,
        "sample_truncated": len(rows) > len(sample),
    }
    user_content = json.dumps(payload, ensure_ascii=False, default=str)

    resp = client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT_SUMMARY},
            {"role": "user", "content": user_content},
        ],
        max_tokens=300,
        temperature=0.3,
    )
    text = (resp.choices[0].message.content or "").strip()
    metrics = LLMCallMetrics(
        input_tokens=resp.usage.prompt_tokens,
        output_tokens=resp.usage.completion_tokens,
        cache_read_input_tokens=getattr(resp.usage, "prompt_cache_hit_tokens", 0) or 0,
        model=DEFAULT_MODEL,
        provider=DEFAULT_PROVIDER,
    )
    return text, metrics
