-- 심사 담당자가 매기는 찜 상태(후보/선정/보류/제외). companies와 별도 테이블로 둬서
-- master_table 뷰(팀원A·프론트 기존 인터페이스)를 건드리지 않는다.
-- 행이 없는 기업은 기본값 '후보'로 취급(애플리케이션 레이어에서 COALESCE).

CREATE TABLE IF NOT EXISTS company_review_status (
    company_id INTEGER PRIMARY KEY REFERENCES companies(company_id),
    status TEXT NOT NULL DEFAULT '후보' CHECK (status IN ('후보', '선정', '보류', '제외')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE company_review_status IS
'기업선정 화면의 선정/보류/제외 찜 상태. UPSERT로 갱신(company_id 없으면 기본 후보).
 신규 기업 기업선정 시스템 프론트 개편(design_handoff_기업선정시스템) PATCH /companies/{id}/review-status 대응.';
