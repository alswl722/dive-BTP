#!/usr/bin/env bash
# 본선 실데이터 투입 파이프라인 — 스키마 사전진단 → EDA → ETL 적재 → 사후검증 → fixture 갱신.
#
# 전제:
#   - db 컨테이너 기동 중 (docker compose up -d db)
#   - DATABASE_URL 환경변수 (예: postgresql://foedev:foedev@localhost:5432/foedev)
#   - 로컬 파이썬에 backend/requirements.txt 설치됨 (pandas/sqlalchemy/openpyxl 등)
#
# 사용법:
#   DATABASE_URL=postgresql://foedev:foedev@localhost:5432/foedev \
#     ./scripts/run_data_pipeline.sh --kodata /path/to/kodata.xlsx --btp /path/to/btp.xlsx
#
#   인자를 생략하면 backend/etl/data/의 현재 샘플 파일을 그대로 쓴다(리허설용).
#
# 각 단계 결과가 남기는 로그는 사람이 눈으로 보고 판단하는 대화형 스텝(특히 2·5단계)이라,
# 스크립트는 실행만 자동화하고 튜닝은 자동화하지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."

KODATA=""
BTP=""
SKIP_TESTS=0
FROM_STAGE=1
EDA_ONLY=0

usage() {
    cat <<EOF
사용법: $0 [--kodata PATH] [--btp PATH] [--skip-tests] [--from-stage N] [--eda-only]

  --kodata PATH     KODATA 기업데이터 xlsx (기본: backend/etl/data/ 샘플)
  --btp PATH        부산TP 사업기업목록 xlsx (기본: backend/etl/data/ 샘플)
  --skip-tests      0단계(합성데이터 자체테스트) 건너뛰기
  --from-stage N    N단계부터 시작 (1~6, 재시도용)
  --eda-only        0~2단계(자체테스트·스키마진단·EDA)만 실행 후 종료.
                     읽기 전용이라 DB 마이그레이션/ETL 적재 없이 DATABASE_URL도 불필요.

DATABASE_URL 환경변수 필요 (--eda-only 사용 시 불필요)
EOF
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --kodata) KODATA="$2"; shift 2 ;;
        --btp) BTP="$2"; shift 2 ;;
        --skip-tests) SKIP_TESTS=1; shift ;;
        --from-stage) FROM_STAGE="$2"; shift 2 ;;
        --eda-only) EDA_ONLY=1; shift ;;
        -h|--help) usage ;;
        *) echo "알 수 없는 인자: $1"; usage ;;
    esac
done

# --eda-only는 0~2단계(읽기 전용)만 돌고 3단계(DB 마이그레이션) 이전에 종료하므로
# DATABASE_URL이 필요 없다. 그 외에는 3단계부터 DB에 쓰므로 필수.
if [[ $EDA_ONLY -eq 0 ]]; then
    : "${DATABASE_URL:?DATABASE_URL 환경변수 필요 (예: postgresql://foedev:foedev@localhost:5432/foedev)}"
fi

step() {
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo "  $1"
    echo "════════════════════════════════════════════════════════════"
}

# --kodata/--btp가 비어 있으면(기본 샘플 사용) 인자 자체를 생략 — bash 3.2(macOS 기본)의
# 빈 배열 "${ARR[@]}" unbound variable 문제를 피하려고 배열 대신 함수로 분기한다.
run_etl_step() {
    if [[ -n "$KODATA" && -n "$BTP" ]]; then
        python3 run_etl.py --kodata "$KODATA" --btp "$BTP"
    elif [[ -n "$KODATA" ]]; then
        python3 run_etl.py --kodata "$KODATA"
    elif [[ -n "$BTP" ]]; then
        python3 run_etl.py --btp "$BTP"
    else
        python3 run_etl.py
    fi
}

run_schema_drift_step() {
    if [[ -n "$KODATA" && -n "$BTP" ]]; then
        python3 backend/etl/check_schema_drift.py --kodata "$KODATA" --btp "$BTP"
    elif [[ -n "$KODATA" ]]; then
        python3 backend/etl/check_schema_drift.py --kodata "$KODATA"
    elif [[ -n "$BTP" ]]; then
        python3 backend/etl/check_schema_drift.py --btp "$BTP"
    else
        python3 backend/etl/check_schema_drift.py
    fi
}

run_eda_company_size_step() {
    if [[ -n "$KODATA" ]]; then
        python3 scripts/eda_company_size.py --kodata "$KODATA"
    else
        python3 scripts/eda_company_size.py
    fi
}

run_eda_finance_recovery_step() {
    if [[ -n "$KODATA" ]]; then
        python3 scripts/eda_finance_recovery.py --kodata "$KODATA"
    else
        python3 scripts/eda_finance_recovery.py
    fi
}

run_eda_selection_result_step() {
    if [[ -n "$BTP" ]]; then
        python3 scripts/eda_selection_result.py --btp "$BTP"
    else
        python3 scripts/eda_selection_result.py
    fi
}

# Phase 2 EDA — KODATA만 필요한 것들
_run_kodata_eda() {
    local script="$1"
    if [[ -n "$KODATA" ]]; then
        python3 "$script" --kodata "$KODATA"
    else
        python3 "$script"
    fi
}

# KSIC 정합성·종합 커버리지는 KODATA + BTP 둘 다 필요
# bash 3.2(macOS 기본)는 set -u에서 빈 배열 "${args[@]}" 확장 시 unbound variable 에러 —
# run_etl_step과 동일하게 배열 대신 인자 유무 분기로 회피한다.
_run_dual_eda() {
    local script="$1"
    if [[ -n "$KODATA" && -n "$BTP" ]]; then
        python3 "$script" --kodata "$KODATA" --btp "$BTP"
    elif [[ -n "$KODATA" ]]; then
        python3 "$script" --kodata "$KODATA"
    elif [[ -n "$BTP" ]]; then
        python3 "$script" --btp "$BTP"
    else
        python3 "$script"
    fi
}

# ── 0단계: 합성데이터 자체 테스트 (데이터 무관, 로직 검증) ──────────────
if [[ $SKIP_TESTS -eq 0 && $FROM_STAGE -le 1 ]]; then
    step "0/6  자체 테스트 (재무·기술 엣지케이스)"
    python3 backend/etl/test_edge_cases.py
    python3 backend/etl/test_tech_edge_cases.py
fi

# ── 1단계: 적재 전 스키마 드리프트 사전진단 (읽기 전용) ─────────────────
if [[ $FROM_STAGE -le 1 ]]; then
    step "1/6  스키마 드리프트 사전진단 (config/*.yaml vs 실제 xlsx 헤더)"
    run_schema_drift_step
fi

# ── 2단계: EDA (읽기 전용, 적재 전에도 동작) + INDEX 생성 ────────────────
# Phase 1 — 원본 데이터 진단(기존 3개)
# Phase 2 — 규모·상관·특허·NTIS·KSIC·종합 커버리지(신규 6개)
# 각 EDA는 표준출력 진단 + eda_reports/<카테고리>/에 PNG·meta.json 저장.
# 마지막에 eda_index.py가 모든 meta.json을 읽어 eda_reports/INDEX.md 생성.
if [[ $FROM_STAGE -le 2 ]]; then
    # Phase 1
    step "2/6  EDA — 기업규모 결측·정합성"
    run_eda_company_size_step

    step "2/6  EDA — 재무 파생 결측 복원"
    run_eda_finance_recovery_step

    step "2/6  EDA — 선정결과 결측 추론"
    run_eda_selection_result_step

    # Phase 2 — 크로스 검증·대체 정책 근거
    step "2/6  EDA — 규모 경계값 실측"
    _run_kodata_eda scripts/eda_size_thresholds.py

    step "2/6  EDA — 종업원수 ↔ 국민연금 상관"
    _run_kodata_eda scripts/eda_employment_impute.py

    step "2/6  EDA — 특허 유효여부 케이스"
    _run_kodata_eda scripts/eda_patent_validity.py

    step "2/6  EDA — NTIS 지역구분 분포"
    _run_kodata_eda scripts/eda_ntis_region.py

    step "2/6  EDA — KSIC 코드 정합성"
    _run_dual_eda scripts/eda_ksic_consistency.py

    step "2/6  EDA — 결측 커버리지 종합 (GO/NO-GO)"
    _run_dual_eda scripts/eda_missing_coverage.py

    step "2/6  EDA — 리포트 인덱스 (eda_reports/INDEX.md)"
    python3 scripts/eda_index.py
fi

if [[ $EDA_ONLY -eq 1 ]]; then
    echo ""
    echo "✅ EDA 완료 (--eda-only) — eda_reports/INDEX.md에서 GO/NO-GO 판정 확인"
    exit 0
fi

# ── 3단계: 마이그레이션 (재실행 안전) ───────────────────────────────────
if [[ $FROM_STAGE -le 3 ]]; then
    step "3/6  DB 마이그레이션"
    DATABASE_URL="$DATABASE_URL" ./db/migrations/run_migrations.sh
fi

# ── 4단계: ETL 적재 ──────────────────────────────────────────────────
if [[ $FROM_STAGE -le 4 ]]; then
    step "4/6  ETL 적재 (엑셀 → PostgreSQL)"
    ( cd backend/etl && DATABASE_URL="$DATABASE_URL" run_etl_step )
fi

# ── 5단계: 적재 후 DB 기준 검증 ─────────────────────────────────────────
# validate_scores/validate_tech_mapping은 임계값 위반(❌) 시 exit 1로 "사람이 검토
# 필요"를 신호하는 게 정상 설계 — 파이프라인을 중단시키지 않고 경고만 모아 마지막에 보여준다.
NEEDS_REVIEW=0

if [[ $FROM_STAGE -le 5 ]]; then
    step "5/6  결측치·커버리지 리포트"
    DATABASE_URL="$DATABASE_URL" python3 backend/etl/check_data_quality.py

    step "5/6  스코어링 상수 타당성 검증 (샘플 튜닝값이 실데이터에도 유효한지)"
    DATABASE_URL="$DATABASE_URL" python3 scripts/validate_scores.py --source db || NEEDS_REVIEW=1

    step "5/6  기술 도메인 매핑률 검증"
    DATABASE_URL="$DATABASE_URL" python3 scripts/validate_tech_mapping.py --source db || NEEDS_REVIEW=1
fi

# ── 6단계: fixture 갱신 (프론트 데모/개발용) ────────────────────────────
if [[ $FROM_STAGE -le 6 ]]; then
    step "6/6  fixture 갱신 (frontend/lib/fixtures/*.json)"
    ( cd backend/etl && DATABASE_URL="$DATABASE_URL" python3 export_fixtures.py )
fi

echo ""
if [[ $NEEDS_REVIEW -eq 1 ]]; then
    echo "⚠️  파이프라인 완료 — 단, 5단계에서 임계값 위반(❌)이 있었다. 위 로그의 [요약] 섹션 확인."
else
    echo "✅ 파이프라인 완료"
fi
echo "   위 로그에서 사람이 눈으로 판단해야 하는 지점:"
echo "   - 2단계 EDA: 결측률/정합성 위반 건수가 예상 범위인지"
echo "   - 5단계 validate_scores/validate_tech_mapping: 상수·yaml 튜닝 필요 여부"

exit $NEEDS_REVIEW
