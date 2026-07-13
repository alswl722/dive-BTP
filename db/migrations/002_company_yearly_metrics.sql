-- 연도별 고용/재무 지표 (KODATA '1. 기업정보' 시트의 2020~2024 반복 블록을 wide→long 변환)
-- PK: (company_id, year)

CREATE TABLE IF NOT EXISTS company_yearly_metrics (
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    year INTEGER NOT NULL,
    employee_count INTEGER,               -- 종업원수
    pension_subscribers INTEGER,          -- 국민연금 가입자수
    pension_employed INTEGER,             -- 국민연금 취업자수
    pension_retired INTEGER,              -- 국민연금 퇴직자수
    avg_annual_salary_krw NUMERIC,        -- 1인평균년간급여(합계) ⚠️ 단위=원
    revenue_thousand_krw NUMERIC,         -- 매출액 (단위=천원, 원본 그대로)
    operating_profit_thousand_krw NUMERIC,-- 영업이익손실
    cogs_thousand_krw NUMERIC,            -- 매출원가
    net_income_thousand_krw NUMERIC,      -- 당기순이익손실
    operating_margin_pct NUMERIC,         -- 영업이익률 (원본이 이미 % 값)
    total_assets_thousand_krw NUMERIC,    -- 자산총계
    total_liabilities_thousand_krw NUMERIC,-- 부채총계
    total_equity_thousand_krw NUMERIC,    -- 자본총계
    paid_in_capital_thousand_krw NUMERIC, -- 납입자본금
    rnd_expense_thousand_krw NUMERIC,     -- 연구개발비
    patents_registered_cum INTEGER,       -- 특허등록건수(최종건수 누적)
    patents_applied_cum INTEGER,          -- 특허출원건수(최종건수 누적)
    PRIMARY KEY (company_id, year)
);

COMMENT ON TABLE company_yearly_metrics IS 'KODATA 1.기업정보 시트의 연도 반복 지표(2020~2024). 재무지표는 전부 천원 단위 원본 그대로 저장.';
COMMENT ON COLUMN company_yearly_metrics.avg_annual_salary_krw IS '⚠️ 이 컬럼만 단위=원. 나머지 금액 컬럼(매출액~연구개발비)은 전부 단위=천원. 직접 비교 시 1000배 스케일 주의 (CLAUDE.md 알려진 이슈 #1)';
