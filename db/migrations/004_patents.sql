-- 특허 및 실용신안 상세 (KODATA '2. 특허및실용신안' 시트, 기업당 다건)

CREATE TABLE IF NOT EXISTS patents (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    ip_type TEXT,           -- 지적재산권 종류 (특허권/실용신안권 등)
    reg_status TEXT,        -- 등록상태
    applied_date DATE,      -- 출원일자
    registered_date DATE,   -- 등록일자
    relation_code TEXT,     -- 회사와의관계코드
    is_valid BOOLEAN        -- 등록유효여부 (Y/N)
);

CREATE INDEX IF NOT EXISTS idx_patents_company ON patents(company_id);

COMMENT ON TABLE patents IS 'KODATA 2.특허및실용신안 시트 — 출원/등록 상세 원장. 기업정보 시트의 특허등록/출원건수(누적)와는 별개(상세 vs 집계).';
