# EDA 파이프라인 설계노트

> 담당: 팀원 D (형우, 기술리드) · 관련 코드: `scripts/eda_*.py`, `backend/etl/eda_viz.py`, `scripts/eda_index.py`
> 상태: **Phase 1·2 완성** (2026-07-24, `feat/eda-visualization` 브랜치)

---

## 1. 목적·범위

**대회 D-day 에 실데이터 받자마자 5~10분 안에 데이터 상태를 판정**하는 진단 파이프라인.
표준출력(터미널) + PNG 시각화 + INDEX.md 자동 리포트 3중 산출.

- **읽기 전용**: DB·config·데이터 파일 어디에도 쓰지 않는다. xlsx 만 읽는다
- **SSOT 원칙**: 프로덕션 ETL 함수를 그대로 재사용 → 드리프트 방지
- **자동 GO/NO-GO**: 대체 규칙 커버리지를 시뮬레이션해 임계값 기반 판정

---

## 2. 아키텍처

```
[진입점] bash scripts/run_data_pipeline.sh --eda-only --kodata <path> --btp <path>
                              │
                              ▼
  ┌──────────────────────────────────────────────┐
  │  Phase 0. Pre-flight (5초)                   │
  │  - xlsx 존재 확인 + eda_reports/ 초기화        │
  └──────────────────────────────────────────────┘
                              │
                              ▼
  ┌──────────────────────────────────────────────┐
  │  Phase 1. 원본 진단 (30초~1분) — 3종         │
  │  ┌─ eda_company_size.py     ▶ 규모 정합성    │
  │  ├─ eda_finance_recovery.py ▶ 재무 항등식    │
  │  └─ eda_selection_result.py ▶ 선정결과 추론  │
  └──────────────────────────────────────────────┘
                              │
                              ▼
  ┌──────────────────────────────────────────────┐
  │  Phase 2. 크로스 검증 (30초~1분) — 6종        │
  │  ┌─ eda_size_thresholds.py    ▶ 규모 경계값  │
  │  ├─ eda_employment_impute.py ▶ 종업원 ↔ 국민연금│
  │  ├─ eda_patent_validity.py   ▶ 특허 유효 케이스│
  │  ├─ eda_ntis_region.py       ▶ NTIS 지역 분포│
  │  ├─ eda_ksic_consistency.py  ▶ KSIC 정합성    │
  │  └─ eda_missing_coverage.py  ▶ 종합 GO/NO-GO  │
  └──────────────────────────────────────────────┘
                              │
                              ▼
  ┌──────────────────────────────────────────────┐
  │  Phase 3. INDEX 생성 (10초)                   │
  │  scripts/eda_index.py                         │
  │  - eda_reports/*/meta.json 훑기               │
  │  - 총 판정 (🟢/🟡/🔴)                          │
  │  - 하이라이트 집약 (전 EDA highlights)         │
  │  - eda_reports/INDEX.md 생성                  │
  └──────────────────────────────────────────────┘
                              │
                              ▼
                    eda_reports/INDEX.md 열기
```

---

## 3. 산출물 구조

```
eda_reports/
├── INDEX.md                            ← 팀 공유용 요약 (Phase 3 자동 생성)
│
├── 01_company_size/                    ← Phase 1
│   ├── meta.json
│   ├── missing_rate.png                ← 5개 컬럼 결측률 bar
│   ├── size_employee_boxplot.png       ← 규모별 종업원수 vs 법정선
│   └── inconsistencies.png             ← 정합성 위반 (있을 때만)
│
├── 02_finance_recovery/
│   ├── meta.json
│   ├── missing_before_after.png        ← 6개 재무 컬럼 복원 전/후
│   ├── recovery_by_rule.png            ← 규칙별 복원 건수
│   └── identity_violations.png         ← 항등식 위반 (있을 때만)
│
├── 03_selection_result/
│   ├── meta.json
│   ├── missing_by_year.png             ← 2022/23/24 결측률
│   ├── inference_accuracy.png          ← 정답/오분류/기권
│   └── population_shift.png            ← 모집단 변동
│
├── 04_size_thresholds/                 ← Phase 2 — 신규
│   ├── employee_by_size_hist.png       ← 규모별 종업원수 histogram
│   ├── revenue_by_size_cdf.png         ← 규모별 매출액 CDF
│   └── emp_vs_revenue_scatter.png      ← 종업원 × 매출액 산점도
│
├── 05_employment_impute/
│   ├── employee_vs_pension_scatter.png ← 종업원수 vs 국민연금 산점도
│   ├── correlation_by_year.png         ← 연도별 상관계수 line
│   └── group_mean_impute_options.png   ← 규모별 대체값 후보
│
├── 06_patent_validity/
│   ├── status_by_validity.png          ← 등록상태 × 유효여부 heatmap
│   ├── expiration_check.png            ← 출원경과년수 histogram
│   └── exception_cases.png             ← 등록 케이스 세부 분류
│
├── 07_ntis_region/
│   ├── region_variety_per_company.png  ← 기업당 지역 종류수
│   └── mode_dominance.png              ← 최빈값 점유율 histogram
│
├── 08_ksic_consistency/
│   ├── ksic_match_rate.png             ← KSIC 대조 stacked bar
│   └── multi_code_companies.png        ← 다중 KSIC 기업 분포
│
└── 09_missing_coverage/                 ← Phase 2 종합
    ├── column_missing_rates.png         ← 전 컬럼 결측률 grouped bar
    ├── rule_success_rates.png           ← 대체 규칙별 커버리지
    └── go_nogo_status.png               ← GO/NO-GO donut
```

**총 9개 리포트 · 21개 이미지 · INDEX 1개.**

---

## 4. Phase 1 — 원본 진단 (기존 3종에 시각화 얹음)

### 4.1 eda_company_size.py
- **원본 파일**: KODATA `1. 기업정보` 시트
- **SSOT**: `backend/etl/company_size_checks.py` (`find_inconsistencies`, 법정 상수)
- **판정 대상**:
  - (a) 소상공인 종업원 초과 (법정 상한 10명/5명)
  - (b) 중소기업 졸업선 초과 (매출 1,500억 / 자산 5,000억)
- **판정 원칙**: **값 안 고침, 사실만 노출** (dataQuality.inconsistencies 로 UI 배지)

### 4.2 eda_finance_recovery.py
- **원본 파일**: KODATA `1. 기업정보` 시트 (재무 지표)
- **SSOT**: `backend/etl/finance_recovery.py` (`recover_financial_identities`, `identity_violations`)
- **복원 대상 항등식**:
  - 자산 = 부채 + 자본 (한 값 결측 시 나머지 둘로 복원)
  - 영업이익률 = 영업이익 ÷ 매출 × 100 (한 값 결측 시 복원)
- **위반 탐지**: 값이 다 있는데 항등식이 안 맞으면 원본 데이터 품질 신호

### 4.3 eda_selection_result.py
- **원본 파일**: BTP `2022/23/24_기업지원목록` 시트
- **SSOT**: `backend/etl/selection_inference.py` (`infer_one`, `infer_selection_results`)
- **추론 규칙**: 시작일/종료일에 실제 날짜 → 지원대상, `'-'` → 탈락, 신호 없으면 미상 유지
- **검증**: 라벨 가리고 추론 → 원본과 대조 (오분류 0이어야 정상)
- **모집단 영향**: 지원대상 몇 건 추가되는지 — 축9·랭킹 직결

---

## 5. Phase 2 — 크로스 검증·대체 정책 근거 (신규 6종)

### 5.1 eda_size_thresholds.py
- **왜 필요**: 결측치 처리 전략 문서(§기업규모) "실데이터로 EDA 경계값 설정" 항목의 근거
- **산출**: 규모별 종업원수·매출액 분포 vs 법정 임계선
- **판정**: 표본 극소(<3) 규모 감지 → 백분위 계산 신뢰도 경고

### 5.2 eda_employment_impute.py
- **왜 필요**: 문서 §종업원수 "국민연금으로 대체" + "규모별 평균 대체(개인의견)" 검증
- **산출**: 상관계수(전체·연도별) · 오차 분포 · 규모별 대체값 후보
- **판정 임계**:
  - r ≥ 0.9 → 상호 대체 안전 (GO)
  - 0.7 ≤ r < 0.9 → 오차 감안 (WARN)
  - r < 0.7 → 상호 대체 신중 (BAD)

### 5.3 eda_patent_validity.py
- **왜 필요**: 문서 §등록유효여부 "존속기간 만료 표" 자동 산출
- **산출**: 등록상태 × 유효여부 크로스탭, 출원경과년수 vs 존속기간
- **존속기간**: 특허 20년 · 실용신안 10년 · 상표 10년 · 디자인 20년
- **예외 케이스**: 기간 내인데 유효=N → 권리소멸·포기·무효·연차료 미납 (판별 불가)

### 5.4 eda_ntis_region.py
- **왜 필요**: 문서 §NTIS 지역구분명 "최빈값 vs 기타기타" 판단 근거
- **산출**: 기업당 지역 종류수, 최빈값 점유율 분포
- **판정**: 최빈값 점유율 <50% 기업 있으면 → "기타기타" 대체 검토

### 5.5 eda_ksic_consistency.py
- **왜 필요**: 문서 §업종코드 "여기서의 코드랑 기업정보 코드 다름" 실측
- **산출**: 두 소스(기업정보 KSIC vs 기업지원목록 업종코드) 중분류 일치율
- **판정 임계**:
  - 일치율 ≥ 90% → 대체 규칙 안전 (GO)
  - 50~90% → 검토 (WARN)
  - <50% → 스코어링 기준 정책 논의 (NO-GO)

### 5.6 eda_missing_coverage.py (⭐ 종합)
- **왜 필요**: 문서의 전 컬럼 대체 규칙을 실데이터에 적용해 잔여 결측률 시뮬레이션
- **산출**: 컬럼별 원 결측률 · 대체 후 예상 · 규칙별 커버리지
- **GO/NO-GO 임계값** (조정 가능, `scripts/eda_missing_coverage.py` 상수):
  - `GO_MAX = 5.0` — 결측률 <5% 또는 대체 후 <5% → GO
  - `NOGO_MIN = 20.0` — 결측률 >20% 후보
  - `NOGO_AFTER = 15.0` — 대체 후에도 >15% → NO-GO 확정

---

## 6. 공용 헬퍼

### 6.1 backend/etl/eda_viz.py
- **`setup()`**: 한글 폰트 자동 감지 (NanumGothic → Malgun Gothic → AppleGothic → Noto Sans CJK KR)
- **`save_fig(fig, category, name, title)`**: 표준 규격 저장 (150 DPI, 12×5~8 인치)
- **`write_meta(category, title, description, images, highlights, status)`**: meta.json 생성 (INDEX.md 원천)
- **`PALETTE`**: 상태색 통일 (good/warn/bad/muted/info/primary)

### 6.2 scripts/eda_index.py
- **입력**: `eda_reports/*/meta.json`
- **출력**: `eda_reports/INDEX.md`
- **로직**:
  - 각 리포트 status 집계 → 총 판정 (🟢 GO / 🟡 CONDITIONAL / 🔴 NO-GO)
  - 각 리포트 highlights 집약 → 상단 "주요 발견" 섹션
  - 리포트별 인라인 이미지 렌더 (GitHub 웹에서도 정상 표시)

---

## 7. 실행 방법

### 7.1 전체 파이프라인
```bash
bash scripts/run_data_pipeline.sh --eda-only \
    --kodata data/kodata.xlsx --btp data/btp.xlsx
```

### 7.2 개별 실행
```bash
python scripts/eda_size_thresholds.py --kodata data/kodata.xlsx
python scripts/eda_ksic_consistency.py --kodata data/kodata.xlsx --btp data/btp.xlsx
python scripts/eda_index.py     # INDEX 재생성
```

### 7.3 INDEX 열기
```bash
start eda_reports/INDEX.md      # Windows
open eda_reports/INDEX.md       # Mac
xdg-open eda_reports/INDEX.md   # Linux
```

---

## 8. 샘플 데이터 실측 결과 (2026-07-24 기준)

11개 기업 샘플 실행 시 다음 발견:

| 발견 | 상태 |
|---|---|
| KSIC 일치율 37.2% | 🔴 2022 5자리(42500) vs 2023+ 알파벳(C29199) 체계 변경 감지 |
| BTP 다중 KSIC 82% | 🔴 동일 기업이 여러 코드 사용 (예: 기업 2080 = 291·C29·C31) |
| 종업원↔국민연금 r=0.81 | 🟡 강함, 상호 대체 정당 (오차 감안) |
| NTIS 다중 지역 45% | 🟡 최빈값 대체 시 정보 손실 고려 (median 91.3% 는 안전) |
| 특허 유효=N 12건 모두 만료 판정 성공 | 🟢 존속기간 규칙 유효 |
| 결측 커버리지 31 컬럼 GO / 2 컬럼 검토 | 🟢 대체로 데이터 준비 상태 양호 |

---

## 9. 본선 D-day 시나리오

1. **데이터 수신 (T+0)**: `data/` 폴더에 xlsx 저장
2. **파이프라인 실행 (T+5분)**: `bash scripts/run_data_pipeline.sh --eda-only`
3. **INDEX 확인 (T+10분)**: `start eda_reports/INDEX.md`
4. **판정에 따라**:
   - 🟢 GO → ETL 진행 (`--from-stage 3`)
   - 🟡 검토 → 하이라이트 원인 파악 후 정책 논의
   - 🔴 NO-GO → 대체 규칙 코드 수정 (`imputation_rules.py` 등)
5. **재실행** (필요 시): 특정 EDA 만 다시 돌리거나 `--from-stage 2` 로 전체 재실행

---

## 10. 한계 & 다음 단계

- **한글 폰트**: Docker Ubuntu 컨테이너에서 `apt-get install fonts-nanum` 미설치 시 라벨 □ 표시. 로컬 실행에선 문제 없음
- **표본 규모**: 샘플 11개는 KSIC 그룹 대부분 < MIN_GROUP → 백분위가 전체fallback 로 떨어짐. 본선 대량 데이터에서 유의미해짐
- **GO/NO-GO 임계값**: 현재 값은 초기 추정. 본선 첫 실행 후 재조정 필요 (`eda_missing_coverage.py` 상수)
- **로드맵**:
  - EDA 결과를 slack/notion webhook 으로 자동 전송
  - INDEX.md 를 GitHub Pages 로 발행 (팀 실시간 공유)
  - 임계값 위반 시 자동 이슈 생성

---

## 11. 관련 문서

- 결측 대체 규칙 원본: 김형우 결측치 처리 전략 PDF (팀 공유 문서)
- 각 축 설계노트: `docs/재무축_설계노트.md`, `docs/축9_설계노트.md`, `docs/고용축_설계노트.md` 등
- 프로덕션 SSOT 모듈: `backend/etl/company_size_checks.py`, `finance_recovery.py`, `selection_inference.py`
