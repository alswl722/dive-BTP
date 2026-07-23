"""챗봇 오케스트레이션 — LLM 의도 분류 → (navigate | query | clarify) 분기.

흐름:
  question → chatbot_llm.classify_intent()
       ├── navigate  → validate_nav_path() → 프론트가 router.push
       ├── query     → validate_sql() → execute() → chatbot_llm.summarize()
       └── clarify   → 안내 문구 그대로 반환

두 가지 화이트리스트:
  - SQL: 허용 테이블 · SELECT/WITH만 · 금지 키워드 차단 · LIMIT 강제
  - Path: 앱 내부 경로만 (외부 URL·상대경로·traversal 차단)
"""

from __future__ import annotations

import re
from typing import Any

import sqlglot
from sqlglot import exp
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db import get_engine
from app.services import chatbot_llm

# ============================================================
# 화이트리스트 · 금지어
# ============================================================
# 스키마 요약 프롬프트에 노출한 것과 1:1 대응(추가 시 프롬프트 SCHEMA_DOC도 갱신).
ALLOWED_RELATIONS = {
    # 테이블
    "companies",
    "company_yearly_metrics",
    "company_certifications",
    "patents",
    "ntis_lead_projects",
    "ntis_consigned_projects",
    "company_business_purposes",
    "support_programs",
    "support_records",
    "company_review_status",
    "notes",
    "note_mentions",
    # 뷰
    "master_table",
    "ntis_projects",
    "data_quality_flags",
    "company_age_now",
}

# 대소문자 무시 완전 단어 매칭으로 잡을 금지 키워드
FORBIDDEN_KEYWORDS = {
    "insert", "update", "delete", "truncate", "drop", "alter", "create",
    "grant", "revoke", "execute", "call", "do", "copy", "vacuum", "analyze",
    "cluster", "reindex", "refresh", "listen", "notify", "lock", "prepare",
    "deallocate", "reset", "set", "show", "checkpoint", "commit", "rollback",
    "savepoint", "begin", "start", "end",
}

# 완전 차단할 서브패턴(주석·연결·시스템스키마·확장함수).
FORBIDDEN_PATTERNS = [
    (re.compile(r"--"), "SQL 주석(--) 금지"),
    (re.compile(r"/\*"), "SQL 블록 주석(/*) 금지"),
    (re.compile(r";\s*\S"), "여러 문장 실행 금지(세미콜론)"),
    (re.compile(r"\bpg_[a-z_]+", re.IGNORECASE), "시스템 카탈로그(pg_*) 접근 금지"),
    (re.compile(r"\binformation_schema\b", re.IGNORECASE), "information_schema 접근 금지"),
    (re.compile(r"\bcurrent_setting\b", re.IGNORECASE), "current_setting 사용 금지"),
    (re.compile(r"\bpg_read_", re.IGNORECASE), "pg_read_* 사용 금지"),
    (re.compile(r"::regclass\b", re.IGNORECASE), "regclass 캐스팅 금지"),
]

STATEMENT_TIMEOUT_MS = 5000
MAX_ROWS = 200

# 프론트 라우트 화이트리스트 — LLM이 반환하는 navigate.path는 여기 정의된 패턴만 통과.
# chatbot_llm.ROUTES_DOC과 1:1 대응 (문서 갱신 시 여기도 같이 손볼 것).
NAV_PATH_PATTERNS = [
    re.compile(r"^/$"),                                              # 홈
    re.compile(r"^/companies/?$"),                                   # 기업 목록
    re.compile(r"^/companies/\d+/?$"),                               # 기업 상세
    re.compile(r"^/programs(?:/?\?[a-zA-Z0-9=&%._\-]+)?/?$"),        # 지원사업 목록 (± 쿼리)
    re.compile(r"^/notes/?$"),                                       # 메모
    re.compile(r"^/selected/?$"),                                    # 선정 기업
    re.compile(r"^/duplicates/?$"),                                  # 중복지원
    re.compile(r"^/compare/?$"),                                     # 비교
]


class ChatbotError(Exception):
    """검증 실패·실행 실패를 라우터에서 400/503으로 매핑하기 위한 사용자 안전 예외."""


def validate_nav_path(path: str) -> str:
    """LLM이 반환한 이동 경로를 화이트리스트 대조. 통과분만 그대로 반환."""
    if not path or not path.strip():
        raise ChatbotError("이동 경로가 비어있습니다.")
    p = path.strip()
    # 스킴이 붙은 절대 URL(https://…) · 상대 경로(.., ./) · 프로토콜 상대(//)는 애초에 걸러낸다.
    if not p.startswith("/") or p.startswith("//") or ".." in p:
        raise ChatbotError(f"허용되지 않은 경로 형태: {p}")
    if any(pat.match(p) for pat in NAV_PATH_PATTERNS):
        return p
    raise ChatbotError(f"허용되지 않은 경로: {p}")


# ============================================================
# 검증
# ============================================================
def _strip_string_literals(sql: str) -> str:
    """검사 편의를 위해 문자열 리터럴만 잠시 제거. 실제 실행은 원본으로."""
    return re.sub(r"'([^']|'')*'", "''", sql)


def validate_sql(sql: str) -> str:
    """SELECT/WITH-only · 화이트리스트 테이블 · LIMIT 강제. 통과한 SQL 반환."""
    if not sql or not sql.strip():
        raise ChatbotError("생성된 SQL이 비어있습니다.")

    cleaned = sql.strip().rstrip(";").strip()
    scan = _strip_string_literals(cleaned)

    lowered = scan.lower()
    if not (lowered.startswith("select") or lowered.startswith("with")):
        raise ChatbotError("SELECT 문만 허용됩니다.")

    for pat, reason in FORBIDDEN_PATTERNS:
        if pat.search(scan):
            raise ChatbotError(f"안전 정책 위반: {reason}")

    # 단어 경계 매칭으로 금지 키워드 검사
    for word in re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]*\b", scan):
        if word.lower() in FORBIDDEN_KEYWORDS:
            raise ChatbotError(f"허용되지 않은 키워드: {word.upper()}")

    # 테이블 참조는 sqlglot AST로 추출한다.
    # 정규식으로 `FROM/JOIN 뒤 identifier`를 잡으면 EXTRACT(YEAR FROM CURRENT_DATE)나
    # TRIM(BOTH ' ' FROM col) 같은 함수 인자의 FROM까지 오탐된다. AST에서 exp.Table
    # 노드만 골라내면 실제 테이블 참조만 남는다.
    try:
        parsed = sqlglot.parse_one(cleaned, dialect="postgres")
    except Exception as e:  # noqa: BLE001
        raise ChatbotError(f"SQL 구문 파싱 실패: {e}")

    cte_names = {c.alias_or_name.lower() for c in parsed.find_all(exp.CTE)}
    for table in parsed.find_all(exp.Table):
        name = (table.name or "").lower()
        if not name or name in cte_names:
            continue  # CTE alias는 허용(WITH 절에서 정의됨)
        if name not in ALLOWED_RELATIONS:
            raise ChatbotError(f"허용되지 않은 테이블/뷰: {table.name}")

    # LIMIT 강제 — 없으면 붙임(과다 결과 방지)
    if not re.search(r"\blimit\s+\d+\b", scan, re.IGNORECASE):
        cleaned = f"{cleaned}\nLIMIT {MAX_ROWS}"

    return cleaned


# ============================================================
# 실행
# ============================================================
def execute(sql: str) -> tuple[list[str], list[dict[str, Any]]]:
    """검증 통과 SQL 실행. statement_timeout으로 감싼 read-only 트랜잭션.

    반환: (columns, rows). row는 dict 형태.
    """
    engine = get_engine()
    try:
        with engine.connect() as conn:
            # 트랜잭션 단위로 read only + timeout — 세션 상태를 오염시키지 않음
            with conn.begin():
                conn.exec_driver_sql(f"SET LOCAL statement_timeout = {STATEMENT_TIMEOUT_MS}")
                conn.exec_driver_sql("SET LOCAL transaction_read_only = on")
                result = conn.execute(text(sql))
                columns = list(result.keys())
                rows = [dict(r) for r in result.mappings().all()]
        # MAX_ROWS 초과분은 잘라낸다(검증 시 LIMIT 붙였지만 LLM이 다른 값 넣었을 수 있음)
        if len(rows) > MAX_ROWS:
            rows = rows[:MAX_ROWS]
        return columns, rows
    except SQLAlchemyError as e:
        # 원본 예외 메시지엔 SQL 내용이 통째로 실리는 경우가 있어 앞부분만 노출.
        msg = str(getattr(e, "orig", e)).splitlines()[0][:200]
        raise ChatbotError(f"SQL 실행 실패: {msg}")



def _empty_answer(question: str, intent: str, action: str, answer: str) -> dict[str, Any]:
    """navigate/clarify처럼 SQL 실행이 없는 응답의 공통 shape."""
    return {
        "question": question,
        "action": action,
        "intent": intent,
        "path": None,
        "sql": "",
        "columns": [],
        "rows": [],
        "answer": answer,
        "error": None,
    }


# ============================================================
# 오케스트레이션
# ============================================================
def ask(question: str) -> dict[str, Any]:
    """엔드투엔드 — 라우터가 그대로 반환할 dict.

    - navigate: 경로 화이트리스트 통과 시 프론트가 router.push (LLM 요약 호출 없음 → 1콜)
    - query:    기존 SQL 파이프라인 (실패 시 1회 재시도) + 요약 (성공 시 2~3콜)
    - clarify:  clarification 문구 그대로 안내 (1콜)
    """
    if not chatbot_llm.is_available():
        raise ChatbotError(
            "OPENAI_API_KEY / DEEPSEEK_API_KEY 둘 다 미설정 — 챗봇 비활성화 상태입니다."
        )

    # Step 1: 의도 분류 (kind + path/sql/clarification)
    intent, _ = chatbot_llm.classify_intent(question)

    # --- navigate ---
    if intent.kind == "navigate":
        path = validate_nav_path(intent.path)
        # intent 문구가 "해석:" 줄에 다시 나오므로 answer는 짧게.
        return {**_empty_answer(question, intent.intent, "navigate", "이동합니다."), "path": path}

    # --- clarify ---
    if intent.kind == "clarify":
        answer = intent.clarification or "요청을 이해하지 못했습니다."
        return _empty_answer(question, intent.intent, "clarify", answer)

    # --- query (기본 경로) ---
    if not intent.sql.strip():
        # LLM이 query로 분류했지만 SQL을 못 만든 경우 — clarify로 fallback
        return _empty_answer(
            question, intent.intent, "clarify",
            intent.clarification or "질문에 해당하는 조회를 만들지 못했습니다.",
        )

    # 검증 + 실행 · 실패 시 에러 원문을 LLM에 되돌려 한 번만 재작성
    # (뷰 컬럼명 환각 — 예: data_quality_flags.id — 이 가장 흔한 실패 원인)
    try:
        validated_sql = validate_sql(intent.sql)
        columns, rows = execute(validated_sql)
    except ChatbotError as first_err:
        intent, _ = chatbot_llm.classify_intent(
            question, prior_sql=intent.sql, prior_error=str(first_err)
        )
        if intent.kind != "query" or not intent.sql.strip():
            return _empty_answer(
                question, intent.intent, "clarify",
                intent.clarification or "질문에 해당하는 조회를 만들지 못했습니다.",
            )
        # 두 번째도 실패하면 그대로 올린다 (라우터가 400으로 변환)
        validated_sql = validate_sql(intent.sql)
        columns, rows = execute(validated_sql)

    # 요약
    answer_text, _ = chatbot_llm.summarize(question, validated_sql, rows, columns)

    return {
        "question": question,
        "action": "query",
        "intent": intent.intent,
        "path": None,
        "sql": validated_sql,
        "columns": columns,
        "rows": rows,
        "answer": answer_text,
        "error": None,
    }
