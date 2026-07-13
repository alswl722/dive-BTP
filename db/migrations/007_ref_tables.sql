-- 참조 테이블 (부산TP 사업기업목록 '참고' 시트)
-- 실제 시트에는 "사업구분참조"·"지원구분참조" 두 표만 존재한다.
-- ⚠️ CLAUDE.md에 언급된 "기업구분참조"는 실제 발제 샘플 데이터에는 없음(문서-데이터 불일치, docs에 기록).

CREATE TABLE IF NOT EXISTS ref_business_types (
    business_type TEXT PRIMARY KEY,   -- 사업구분 (RnD/기반구축/사업기획/기술지원/사업화지원/패키지지원/스마트공장/일자리창출or인력양성/기타)
    macro_category TEXT               -- 상위 대분류 (RnD/복합/기업지원)
);

CREATE TABLE IF NOT EXISTS ref_support_types (
    business_type TEXT NOT NULL REFERENCES ref_business_types(business_type),
    support_type TEXT NOT NULL,       -- 지원구분 (사업구분별로 유효한 값이 다름)
    PRIMARY KEY (business_type, support_type)
);

COMMENT ON TABLE ref_business_types IS '사업구분 참조. support_programs.business_type / support_records.business_type이 참조하는 카테고리 체계(느슨한 참조 — FK 미설정, 실데이터에 참조무결성 깨질 수 있어 로드 실패 방지).';
COMMENT ON TABLE ref_support_types IS '지원구분 참조. 사업구분(business_type)별 유효한 지원구분(support_type) 목록. support_records.support_detail_main이 참조.';
