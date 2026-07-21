-- 사업 단위 심사 상태(후보/선정/보류/제외). 같은 기업이 여러 사업에 신청할 수 있어
-- 상태를 (기업 × 사업)으로 구분한다 — 011의 기업단위(company_id PK) 상태를 대체.
--   program_key = "연도:사업코드" (예 '2024:B1_1_3'). 프론트 programKey와 동일 포맷.
-- 행이 없는 (기업,사업)은 기본값 '후보'로 취급(애플리케이션 레이어 COALESCE).
-- ※ 011(company_review_status)은 기업단위라 이 테이블과 별개 — 기존 데이터는 이전하지 않는다.

CREATE TABLE IF NOT EXISTS company_program_review_status (
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    program_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '후보' CHECK (status IN ('후보', '선정', '보류', '제외')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, program_key)
);

COMMENT ON TABLE company_program_review_status IS
'사업 단위 심사 상태. UPSERT로 갱신((company_id, program_key) 없으면 기본 후보).
 PATCH /companies/{id}/review-status (body.programKey) 대응. 조회는 GET /review-status.';
