-- docker-entrypoint-initdb.d 로 마운트되어 컨테이너 최초 기동 시 1회 실행됨
-- 실제 테이블 스키마는 backend/etl 의 config 기반 컬럼 매핑이 확정된 후 채운다

CREATE EXTENSION IF NOT EXISTS pgcrypto;
