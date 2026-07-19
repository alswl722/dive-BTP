"""챗봇 오케스트레이션 — LLM 생성 SQL 검증 · 실행 · 요약.

흐름:
  question → chatbot_llm.generate_sql() → validate_sql() → execute() → chatbot_llm.summarize()
       → ChatbotAnswer(sql, intent, columns, rows, answer, error?)

SQL 검증은 화이트리스트 방식(허용 테이블 · SELECT/WITH만 · 금지 키워드 차단 · LIMIT 강제).
실행은 statement_timeout 5초로 감싸 무한쿼리·과부하 방어.
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


class ChatbotError(Exception):
    """검증 실패·실행 실패를 라우터에서 400/503으로 매핑하기 위한 사용자 안전 예외."""


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


# ============================================================
# 오케스트레이션
# ============================================================
def ask(question: str) -> dict[str, Any]:
    """엔드투엔드 — 라우터가 그대로 반환할 dict."""
    if not chatbot_llm.is_available():
        raise ChatbotError("DEEPSEEK_API_KEY 미설정 — 챗봇 비활성화 상태입니다.")

    # Step 1: SQL 생성
    gen, _ = chatbot_llm.generate_sql(question)

    # LLM이 조회 불가로 판단한 경우 — SQL 실행 없이 안내만 반환
    if not gen.sql.strip():
        return {
            "question": question,
            "intent": gen.intent,
            "sql": "",
            "columns": [],
            "rows": [],
            "answer": gen.clarification or "이 도구에 해당 정보가 없어 조회할 수 없습니다.",
            "error": None,
        }

    # Step 2: 검증 + 실행
    validated_sql = validate_sql(gen.sql)
    columns, rows = execute(validated_sql)

    # Step 3: 요약
    answer_text, _ = chatbot_llm.summarize(question, validated_sql, rows, columns)

    return {
        "question": question,
        "intent": gen.intent,
        "sql": validated_sql,
        "columns": columns,
        "rows": rows,
        "answer": answer_text,
        "error": None,
    }
