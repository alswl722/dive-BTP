#!/usr/bin/env bash
# 번호 붙은 마이그레이션 SQL을 순서대로 실행. 재실행해도 안전(CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE).
set -euo pipefail
cd "$(dirname "$0")"

: "${DATABASE_URL:?DATABASE_URL 환경변수 필요 (예: postgresql://foedev:foedev@localhost:5432/foedev)}"

for f in $(ls *.sql | sort); do
    echo "▶ $f"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "✅ 마이그레이션 완료"
