# ETL/인프라 인터페이스 문서

> 담당: 팀원 C(스키마+ETL+축7) · 관련 코드: `db/migrations/`, `backend/etl/{transforms,parsers,loaders,run_etl}.py`
> 관련 plan: `.claude/plans/etl-infra-plan.md`

---

## 1. 실행 방법

```bash
# 1) DB 기동
docker compose up -d db

# 2) 마이그레이션 (번호 순 SQL 실행, 재실행해도 안전)
DATABASE_URL=postgresql://foedev:foedev@localhost:5432/foedev ./db/migrations/run_migrations.sh

# 3) ETL (원본 엑셀 2개 → 정규화 테이블)
cd backend/etl
DATABASE_URL=postgresql://foedev:foedev@localhost:5432/foedev python run_etl.py

# 4) (선택) parquet 모드로 개발 중인 팀원용 — master_table 뷰를 parquet로 덤프
DATABASE_URL=postgresql://foedev:foedev@localhost:5432/foedev python build_master_table.py
```

원본 엑셀 파일 경로가 바뀌면 `run_etl.py --kodata <path> --btp <path>`로 지정.

---

## 2. 테이블 구조 (정규화 스키마)

| 테이블                           | 소스 시트                      | PK                              | 비고                                        |
| -------------------------------- | ------------------------------ | ------------------------------- | ------------------------------------------- |
| `companies`                      | KODATA 1.기업정보(개요)        | `company_id`                    | 기업일련번호. 모든 테이블의 조인 기준       |
| `company_yearly_metrics`         | KODATA 1.기업정보(연도반복)    | `(company_id, year)`            | 고용/재무 2020~2024, wide→long              |
| `company_certifications`         | KODATA 1.기업정보(인증)        | `(company_id, cert_type)`       | 이노비즈/메인비즈/벤처기업/소재부품/NET/NEP |
| `patents`                        | KODATA 2.특허및실용신안        | `id`                            | 출원/등록 상세 원장                         |
| `ntis_lead_projects`             | KODATA 3-1.NTIS(주관)          | `id`                            |                                             |
| `ntis_consigned_projects`        | KODATA 3-2.NTIS(위탁)          | `id`                            |                                             |
| `ntis_projects` (VIEW)           | 위 두 테이블 UNION             | -                               | role 컬럼(주관/위탁)으로 공용 조회          |
| `company_business_purposes`      | KODATA 4.법인사업목적          | `(company_id, seq)`             |                                             |
| `ref_business_types`             | 부산TP 참고(사업구분참조)      | `business_type`                 |                                             |
| `ref_support_types`              | 부산TP 참고(지원구분참조)      | `(business_type, support_type)` |                                             |
| `support_programs`               | 부산TP 2022~2024\_사업목록     | `(year, program_code)`          |                                             |
| `support_records`                | 부산TP 2022~2024\_기업지원목록 | `id`                            | 중복지원 탐지·반복선정 랭킹의 원장          |
| `industry_code_map`              | (파생, ETL이 자동 스캔해 채움) | `raw_code`                      | §4 참고                                     |
| `support_type_check`             | (파생, ETL이 자동 스캔해 채움) | `(business_type, support_detail, field)` | §4 참고                            |
| `company_age(as_of date)` (함수) | `companies.founded_date`       | -                               | 축7. 기준일 파라미터화                      |
| `master_table` (VIEW)            | 위 전체 조인/피벗              | `기업일련번호`                  | §3 참고                                     |

전체 컬럼 정의와 코멘트는 `db/migrations/*.sql`의 `COMMENT ON` 참고(단일 소스, 문서 이중관리 방지).

---

## 3. `master_table` — 팀원A/프론트 인터페이스

**배경**: ETL 스키마가 확정되기 전, 팀원A(재무축)와 프론트엔드가 이미 "기업 1행 와이드 테이블"을 전제로 `finance_utils.py`/`features_finance.py`/`scoring_finance.py`/`export_fixtures.py`를 구현·병합했다. 이 스크립트들은 `--source db` 모드에서 `pd.read_sql_table("master_table", engine)`으로 읽는다.

**대응**: 정규화 스키마를 소스오브트루스로 두고, `master_table`을 그 위에 얹은 VIEW로 제공(`db/migrations/010_views.sql`). 컬럼명은 원본 KODATA 한글명 + `_연도` 규칙을 그대로 따라서 **팀원 코드를 한 줄도 고치지 않고** 그대로 붙게 만들었다.

검증 완료(`--source db`로 실행, 코드 무변경):

- `features_finance.py --source db` → 25개 파생컬럼 전부 결측 0
- `scoring_finance.py --source db` → 4축 점수 산출, 스팟체크 5건 전부 ✅
- `export_fixtures.py`(parquet 모드) → `frontend/lib/fixtures/*.json` 정상 생성

parquet 모드로 개발하는 팀원은 `build_master_table.py`를 돌리면 DB의 `master_table` 뷰를 `backend/etl/data/master_table.parquet`로 동기화할 수 있다.

**주요 컬럼**: `기업일련번호`(키), `지역`/`KSIC코드(11차)`/`업종명(11차)`, `{지표}_{연도}`(종업원수·매출액·영업이익손실·매출원가·당기순이익손실·영업이익률·자산총계·부채총계·자본총계·납입자본금·연구개발비·특허등록건수·특허출원건수 × 2020~2024), 인증 6종(이노비즈 등, boolean), `NTIS주관_행수`/`NTIS위탁_행수`, `지원건수`/`총지원금_천원`/`지원연도수`.

---

## 4. 알려진 데이터 이슈 대응

| 이슈                                    | 대응                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **단위 불일치**(급여만 원, 나머지 천원) | `company_yearly_metrics.avg_annual_salary_krw`만 원 단위, 나머지는 `*_thousand_krw` 접미사로 단위를 컬럼명에 명시(원본 천원 그대로 저장, 임의 환산 안 함 — 프론트가 이미 "천원" 라벨을 하드코딩 중이라 원 단위로 바꾸면 팀원 코드가 깨짐)                                                                                                                                                                                                                                                                                                   |
| **업종코드 포맷 혼재**                  | 실제 확인 결과 plan 문서의 가정("연도별로 다름")과 달리**같은 연도 시트 안에서도** 5자리 숫자(`42500`)·11차 포맷(`C29199`)·비코드 텍스트(`제조업`, `281102`)가 섞여 있음. `support_records.industry_code_raw`는 원본 그대로 보존하고, 업종 그룹핑은 **항상 신뢰 가능한 `companies.ksic_code`를 company_id로 JOIN**해서 쓸 것을 권장(팀원A도 재무축 설계에서 동일 결정). `industry_code_map`은 자동 스캔 결과만 채움: 11차 포맷은 자동 정규화, 5자리 숫자는 10차→11차 공식 매핑표가 없어 `NULL`(수작업 필요), 비코드 텍스트는 `invalid` 표기 |
| **결측치**                              | 원본 NULL 유지가 기본 정책.`support_records.support_amount_thousand_krw` 등은 원본 결측 보존하고 **집계할 때만** `COALESCE(...,0)`. `data_quality_flags` 뷰가 지원 레코드별 결측 필드 목록을 제공(대시보드 데이터품질 경고용)                                                                                                                                                                                                                                                                                                               |
| **표본 편향**(샘플 11개 전원 반복선정)  | ETL 이슈 아님, 분석 시 주석만(CLAUDE.md 동일)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **지원구분 표기 불일치**                | `support_records.support_detail_main`("지원구분(주요지원)")은 참고 시트의 지원구분참조(`ref_support_types`, 사업유형별 유효값)를 따르는 통제 어휘인데, 로딩 시 검증이 없어 표기 차이가 조용히 섞일 수 있음(샘플 실측: `패키지지원`+`지적재산권` — 참조표엔 동의어 `특허지원`으로만 존재). `support_detail_other`("…외 작성 *패키지지원만")는 애초에 콤마구분 자유서술 다중값이라 통제 어휘 대상이 아님(참조표 매칭률 낮은 게 정상). 값을 임의로 고치지 않고 `support_type_check`가 `(business_type, support_detail)` distinct 조합만 참조표와 대조해 `matched`/`unmatched_combo`/`unmatched_business_type`로 리포트(other는 콤마 분리 후 토큰 단위 대조). 본선 데이터 적재 후 이 테이블의 `unmatched_*` 행을 확인해 오탈자인지 참조표에 없는 신규 값인지 판단할 것 |
| **`(기타, 기타)` 조합 — 참조표 구조적 공백** | 샘플에서 유일하게 `unmatched_combo`로 잡히는 다른 한 건. 표기 오류가 아니라 `ref_support_types`(지원구분참조) 자체에 사업구분="기타"에 대한 유효 지원구분 행이 원래 존재하지 않음(참조표 63행 중 "기타" 사업구분 행이 0개). **의도적으로 참조표에 예외 추가 없이 `unmatched_combo`로 그대로 둠** — 샘플 1건만으로 "기타/기타가 정상 조합"이라 단정할 근거가 부족. 본선 데이터에서 이 조합의 `record_count`가 유의미하게 늘면 그때 참조표에 `(기타, 기타)` 행 추가 여부를 재검토할 것 |
| **문서-데이터 불일치**                  | CLAUDE.md는 참조 테이블로 "사업구분참조·기업구분참조"를 언급하지만, 실제 발제 샘플의`참고` 시트에는 "사업구분참조"·"지원구분참조" 두 표만 존재하고 "기업구분참조"는 없음. `ref_business_types`/`ref_support_types`로 실제 존재하는 두 표만 반영                                                                                                                                                                                                                                                                                             |

---

## 5. 축7(업력)

컬럼이 아니라 **함수**로 제공(하드코딩 금지 원칙 — "현재 시점 기준"과 "선정일 기준" 둘 다 필요할 수 있어서):

```sql
SELECT * FROM company_age();                 -- 현재 시점 기준
SELECT * FROM company_age('2023-01-01');     -- 특정 시점(예: 선정일) 기준
```

설립연도 결측 기업은 `age_years = NULL`(임의값 대체 금지 — 스코어카드에서 "정보없음" 표시할 것).

---

## 6. Definition of Done 체크 (`.claude/plans/etl-infra-plan.md` 기준)

- [x] 11개 시트 전부 PostgreSQL 적재 완료 (기업정보/특허/NTIS 주관·위탁/법인사업목적/2022~2024 사업목록·기업지원목록/참고)
- [x] 스키마 DDL이 마이그레이션 스크립트로 존재(재실행 가능 — `CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE`)
- [x] config 기반 컬럼 매핑으로 연도별 포맷 차이 흡수(`backend/etl/config/*.yaml`, 컬럼명 하드코딩 없음)
- [x] 축7(업력) 컬럼/뷰 계산 완료
- [x] 팀원 인터페이스 문서 전달(본 문서) — 특히 이미 병합된 팀원A/프론트 코드가 기대하던 `master_table` 인터페이스를 무변경으로 충족
