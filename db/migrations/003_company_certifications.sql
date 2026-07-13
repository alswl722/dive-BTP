-- 인증뱃지 보유여부 (KODATA '1. 기업정보' 시트 인증 섹션, 연도 무관 '여부' 컬럼 6개를 row 단위로 정규화)

CREATE TABLE IF NOT EXISTS company_certifications (
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    cert_type TEXT NOT NULL,   -- 이노비즈 / 메인비즈 / 벤처기업 / 소재부품 / NET / NEP
    has_cert BOOLEAN,
    PRIMARY KEY (company_id, cert_type)
);

COMMENT ON TABLE company_certifications IS 'KODATA 1.기업정보 시트 인증 섹션(이노비즈/메인비즈/벤처기업/소재부품/NET/NEP 여부)을 row 단위로 정규화.';
