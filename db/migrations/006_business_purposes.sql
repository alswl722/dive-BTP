-- 법인사업목적 (KODATA '4. 법인사업목적' 시트, 등기부등본상 사업목적 최대 10줄 → row 단위)

CREATE TABLE IF NOT EXISTS company_business_purposes (
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    seq INTEGER NOT NULL,        -- 순서 (1~10)
    purpose_text TEXT,           -- 사업목적항목내용
    registered_date DATE,        -- 등기일자
    PRIMARY KEY (company_id, seq)
);

COMMENT ON TABLE company_business_purposes IS 'KODATA 4.법인사업목적 시트. 사업목적-지원사업 정합성 체크(S-tier 기능)의 입력 데이터.';
