-- docker-entrypoint-initdb.d 로 마운트되어 컨테이너 최초 기동 시 1회 실행됨
-- 테이블 스키마는 여기 두지 않고 db/migrations/*.sql 로 분리 실행한다
-- (컨테이너 재기동마다 매번 도는 init.sql과 분리하는 게 안전 — etl-infra-plan Phase 3)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
