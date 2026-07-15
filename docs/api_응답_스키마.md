# API 응답 스키마 확장 설계 (Phase 5, 팀 공유용)

> 담당: 팀원 D (형우, 기술리드) · 관련 코드: `backend/app/schemas.py`, `frontend/types/index.ts`, `backend/etl/company_view.py`
> 상태: **설계안 (구현 아님)** — 팀원 반환값 정합 기준. 유환(축4·5·6) 산출·민지 성장률 확정 후 병합 예정.

---

## 1. 목적

- 축8 정합성·축9 flag를 **어디에·어떻게** 응답 스키마에 편입할지 확정
- `backend/app/schemas.py` ↔ `frontend/types/index.ts` ↔ `backend/etl/company_view.py` **3자 정합** 유지
- 팀원 반환값(민지 재무, 유환 기술력, 형우 축8·9) 병합 기준 문서
- 신규 엔드포인트·기존 엔드포인트 확장 계획

---

## 2. 현재 스키마 상태 요약

### 2.1 소스오브트루스 관계

```
frontend/types/index.ts  (프론트가 소스오브트루스)
        ↕ 동기화
backend/app/schemas.py   (Pydantic 검증 — 프론트 타입 그대로 옮김)
        ↕ 반환
backend/etl/company_view.py:build_companies()  (실제 dict 조립)
```

### 2.2 현재 필드 (재무축 완료분)

| 영역 | 필드 | 상태 |
| --- | --- | --- |
| `Company.scores: AxisScores` | `Axis = ["성장성","수익성","효율성","안정성"]` (재무 4축 전용) | ✅ 민지 완료 |
| `Company.percentiles`, `Company.rawMetrics` | 재무 파생컬럼 원값·백분위 | ✅ |
| `Company.support` / `supportHistory` | 지원이력 원장 | ✅ |
| `Rankings.byCount` / `byAmount` | 반복선정 랭킹 | ✅ |
| `Company._mock: ["businessFit"]` | **축8 예약 필드** (목업 표기, 실데이터 대기) | ⏳ 형우 |
| **축9 flag 필드** | 미존재 | ⏳ 형우 |
| 유환 축4·5·6 (기술력·인증·NTIS) | Axis literal에도 없고 필드도 없음 | ⏳ 유환 |

---

## 3. 축8 편입 방식 결정

### 3.1 결정: **독립 필드 `Company.businessFit`** (Axis literal 확장 X)

**근거**:
- `Axis`는 **재무 백분위 축**의 논리적 컬렉션. 축8은 LLM 판정 산출이라 백분위 개념 없음 → 컨셉 불일치
- `AXIS_METRICS`가 각 축의 파생컬럼 리스트인데 축8은 파생컬럼이 아니라 (score, match_type, keywords, reasoning) 구조체 → 배열에 못 맞춤
- 프론트 스코어카드 UI에서 재무 4축 레이더 차트는 그대로, 사업정체성은 별도 배지·바 표시가 자연스러움

### 3.2 필드 스펙

```typescript
// frontend/types/index.ts
export interface BusinessFit {
  score: number;                    // 0~100, LLM 판정 종합 점수
  match_type: "직접일치" | "간접관련" | "무관" | "판단유보";
  matched_keywords: string[];        // 최대 3개, 근거 노출용
  reasoning: string;                 // 담당자 근거 tooltip
  source: "whitelist" | "llm" | "pending";  // 판정 경로 (whitelist 통과 vs LLM 판정 vs 결제 대기)
}

export interface Company {
  // ... 기존 필드
  businessFit: BusinessFit | null;   // null = 미판정 (사업목적 결측 등)
}
```

```python
# backend/app/schemas.py
class BusinessFit(BaseModel):
    score: float | None = Field(None, ge=0, le=100)
    match_type: Literal["직접일치", "간접관련", "무관", "판단유보"]
    matched_keywords: list[str] = Field(default_factory=list, max_length=3)
    reasoning: str
    source: Literal["whitelist", "llm", "pending"]

class Company(BaseModel):
    # ... 기존 필드
    businessFit: BusinessFit | None = None
```

### 3.3 `Company._mock` 처리

- **현재**: `_mock: ["businessFit"]` — 프론트 목업 배지 표시
- **Phase 2 활성화 후 (whitelist만)**: `source: "whitelist"` 판정은 `_mock`에서 제거
- **Phase 3 결제 대기 중**: LLM 대상 판정은 `source: "pending"` + `_mock: ["businessFit.llm"]`로 부분 목업 유지 (투명성)
- **Phase 3 완료 후**: `_mock`에서 완전 제거

### 3.4 `company_view.py:build_companies()` 확장 지점

```python
# 현재 (line 138): "_mock": ["businessFit"]
# 확장:
"businessFit": build_business_fit(cid, master, alignment_result),  # 신규 함수
"_mock": _mock_flags_for(alignment_result),  # 조건부 목업 표기
```

`alignment_result`는 `axis8.classify_alignment` + `axis8_llm.judge_alignment` 배치 결과. Phase 5b에서 `_load_source()`에 추가.

---

## 4. 축9 편입 방식 결정

### 4.1 결정: **`RankingRow`에 flag 필드 추가 + `Company`에 요약 배지**

**근거**:
- 축9는 **스코어 제외** (설계노트 §1) → `Company.scores`에 넣지 않음
- rankings 위에 얹는 게 자연스러움 (`/rankings` 엔드포인트 이미 존재, 재구현 금지)
- 스코어카드 상세 화면에도 배지 필요 → `Company`에 요약 필드 추가

### 4.2 필드 스펙

```typescript
export type FlagStatus = "flag" | "cleared" | "observe" | "normal" | "unknown";

export interface DuplicateFlag {
  status: FlagStatus;
  label: string;                        // 발표·화면 한 줄 라벨
  is_repeat: boolean;
  growth_state: "stagnant" | "growing" | "unknown";
  segment: "소액다건" | "대형소수" | "대형다건" | "소액소수";
  is_high_diversity: boolean;           // "여러 부서 반복선정" 신호 (P90+)
}

export interface RankingRow {
  // ... 기존
  flag: FlagStatus | null;              // 랭킹 화면 인라인 배지용
  segment: string | null;               // 세그먼트 요약
}

export interface Company {
  // ... 기존
  duplicateFlag: DuplicateFlag | null;  // 스코어카드 상세 화면 배지용
}
```

```python
# backend/app/schemas.py
FlagStatus = Literal["flag", "cleared", "observe", "normal", "unknown"]
Segment = Literal["소액다건", "대형소수", "대형다건", "소액소수"]

class DuplicateFlag(BaseModel):
    status: FlagStatus
    label: str
    is_repeat: bool
    growth_state: Literal["stagnant", "growing", "unknown"]
    segment: Segment
    is_high_diversity: bool

class RankingRow(BaseModel):
    # ... 기존
    flag: FlagStatus | None = None
    segment: str | None = None

class Company(BaseModel):
    # ... 기존
    duplicateFlag: DuplicateFlag | None = None
```

### 4.3 성장률 mock 상태의 표기

- 축1(민지) 산출 대기 중: `growth_state: "unknown"`, `status: "unknown"`, `label: "성장률 미제공 (축1 대기)"`
- `Company._mock`에 `"duplicateFlag.growth"` 추가 (투명성)
- 민지 산출 붙으면 자동 실데이터 (`axis9.growth_signals_from_axis1()` 헬퍼가 처리)

### 4.4 `company_view.py:build_companies()` 확장 지점

```python
# 배치 실행: metrics_df = compute_support_metrics(sr)
# metrics_df + growth_signals → axis9.classify_flags_batch()
# 결과를 company_id로 lookup
"duplicateFlag": build_duplicate_flag(cid, flag_df, segment_df),
```

`build_rankings()`도 flag_df·segment_df를 인자로 받아 각 row에 `flag`·`segment` 부착.

---

## 5. 신규 엔드포인트 명세

### 5.1 축8 상세 조회 — `GET /companies/{id}/alignment`

**용도**: 스코어카드 상세 화면에서 "정합성 판정 근거 보기" 클릭 시 지원사업별 개별 판정 리스트.

```typescript
interface AlignmentDetail {
  company_id: number;
  business_purposes: string[];                    // 등기부 사업목적 원문
  judgments: {
    program_code: string;
    program_name: string;
    business_type: string;
    year: number;
    fit: BusinessFit;                             // 개별 지원사업 vs 사업목적 판정
  }[];
  summary: BusinessFit;                           // 종합 (Company.businessFit과 동일)
}
```

**라우터 위치**: `backend/app/routers/alignment.py` (신규) 또는 `companies.py` 확장. 결정: 별도 파일 (`alignment.py`) — 축8 스코프 명확

### 5.2 축9 flag 리스트 — `GET /flags/duplicate-support`

**용도**: 관리자 대시보드에서 "중복지원 flag 확인" 필터·정렬 조회.

```typescript
interface FlagListResponse {
  flags: {
    company_id: number;
    name: string;
    industry: string | null;
    support_count: number;
    total_amount_thousand_krw: number;
    max_consecutive_years: number;
    business_type_diversity: number;
    duplicateFlag: DuplicateFlag;
  }[];
  meta: {
    total: number;
    by_status: Record<FlagStatus, number>;         // flag 3개, cleared 5개 등
    growth_source: "axis1" | "mock";               // 현재 성장률 데이터 출처
  };
}
```

**쿼리 파라미터** (Phase 5b 구현 시):
- `?status=flag,observe` — 상태 필터
- `?segment=소액다건` — 세그먼트 필터
- `?min_diversity=4` — 사업유형 다양성 필터

**라우터 위치**: `backend/app/routers/flags.py` (신규)

### 5.3 통합 스코어카드 — `GET /companies/{id}` (기존 확장)

- 기존 응답에 `businessFit`·`duplicateFlag` 필드 편입
- 유환 축4·5·6 산출 후 `scores`·`percentiles`·`rawMetrics`에도 편입 (유환 대기)

---

## 6. `schemas.py` 확장 diff (요약)

```diff
+ from typing import Literal
+
+ FlagStatus = Literal["flag", "cleared", "observe", "normal", "unknown"]
+ Segment = Literal["소액다건", "대형소수", "대형다건", "소액소수"]
  Axis = Literal["성장성", "수익성", "효율성", "안정성"]
+ # TODO(유환): 축4·5·6 완료 시 Axis literal 확장 (기술력·인증 등)
+
+ class BusinessFit(BaseModel):
+     score: float | None = Field(None, ge=0, le=100)
+     match_type: Literal["직접일치", "간접관련", "무관", "판단유보"]
+     matched_keywords: list[str] = Field(default_factory=list, max_length=3)
+     reasoning: str
+     source: Literal["whitelist", "llm", "pending"]
+
+ class DuplicateFlag(BaseModel):
+     status: FlagStatus
+     label: str
+     is_repeat: bool
+     growth_state: Literal["stagnant", "growing", "unknown"]
+     segment: Segment
+     is_high_diversity: bool

  class Company(BaseModel):
      # ... 기존
+     businessFit: BusinessFit | None = None
+     duplicateFlag: DuplicateFlag | None = None

  class RankingRow(BaseModel):
      # ... 기존
+     flag: FlagStatus | None = None
+     segment: str | None = None
```

`frontend/types/index.ts` 동일 shape로 동기 (프론트가 소스오브트루스). PR 시 두 파일 함께 수정.

---

## 7. 팀원 산출물 정합 표

| 필드/영역 | 채우는 사람 | 데이터 소스 | 현재 상태 |
| --- | --- | --- | --- |
| `Company.scores.성장성/수익성/효율성/안정성` | 민지 | `features_score` | ✅ |
| `Company.percentiles`, `rawMetrics` (재무) | 민지 | `features_finance` | ✅ |
| `Company.trends`, `passthrough` | 민지 | `master_table` | ✅ |
| `Company.certifications`, `patents`, `ntis` | 유환 | `master_table` 원본 + 축5·4 파생 | ⏳ 유환 |
| `Company.scores.기술력/인증/NTIS` (신규 축) | 유환 | `features_score` 확장 | ⏳ 유환 |
| `Company.support`, `supportHistory`, `Rankings` | (공통 — company_view 재활용) | `support_records` | ✅ |
| **`Company.businessFit`** | **형우** | `axis8.classify_alignment` + `axis8_llm.judge_alignment` | ⏳ Phase 5b |
| **`Company.duplicateFlag`** | **형우** | `axis9.classify_flags_batch` | ⏳ Phase 5b |
| **`RankingRow.flag/segment`** | **형우** | `axis9.classify_flags_batch` | ⏳ Phase 5b |
| **`GET /companies/{id}/alignment`** | **형우** | `axis8_llm` 상세 저장 | ⏳ Phase 5b |
| **`GET /flags/duplicate-support`** | **형우** | `axis9.classify_flags_batch` | ⏳ Phase 5b |

---

## 8. 대기 항목 & 팀 협의 필요

| 항목 | 대기 대상 | 블록 사유 |
| --- | --- | --- |
| Claude API 결제 승인 | 팀 결정 | 축8 `source: "pending"` 상태 해제 → `source: "llm"` 활성 |
| 민지 성장률 인터페이스 컬럼명·null 정책 합의 | 민지 | `axis9.growth_signals_from_axis1` 실데이터 결합 (`docs/성장률_인터페이스.md`) |
| 유환 축4·5·6 산출 → `Axis` literal 확장 여부 | 유환 | 스코어카드 `scores` 확장 · 신규 축 이름 확정 |
| `Company.businessFit`·`duplicateFlag` 배치 실행 시점 | (형우 결정) | ETL 후 배치? API 요청 시 lazy? — 캐시 전략 (Phase 5b) |
| `/flags/duplicate-support` 권한 필터 | 팀 협의 | CLAUDE.md 원칙4 "권한은 필터로" — role별 스코프 결정 |
| 프론트 UI 확정 (배지 위치·색상) | 프론트 담당자 | 스키마 shape 확정 후 병렬 진행 가능 |

---

## 9. 다음 단계 (Phase 5b, 구현)

Phase 5는 **설계까지**. 실제 구현은 Phase 5b:

1. `schemas.py`·`index.ts` 동시 PR (필드 추가만, 기본값 `null`)
2. `company_view.py:build_companies()` 확장 — `build_business_fit()`·`build_duplicate_flag()` 헬퍼 추가
3. `services/companies.py:_load_source()` 확장 — axis8·axis9 배치 결과 로드
4. `routers/alignment.py`·`routers/flags.py` 신설 · `main.py`에 등록
5. `export_fixtures.py` 확장 — fixture JSON에도 축8·9 필드 포함 (프론트 목업 지원)
6. 유닛테스트 — 스키마 검증, 빈 상태(민지·유환 대기) 안전 처리

Phase 5b 시작 조건:
- 이 문서 팀 검토·합의 완료
- 최소 민지 성장률 계약 확정 (다른 대기 항목은 Phase 5b 진행 중 병렬 해소 가능)

---

## 10. 변경 이력

- 2026-07-16 형우: Phase 5 초안. `schemas.py`·`index.ts`·`company_view.py:138` (`_mock: ["businessFit"]`) 현행 확인 반영.
