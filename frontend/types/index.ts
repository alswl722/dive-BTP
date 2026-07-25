// 재무 축 산출물 + master 기반 프론트 타입.
// fixture(JSON)와 향후 FastAPI 응답이 동일 스키마를 따른다.

export const AXES = ["성장성", "수익성", "효율성", "안정성"] as const;
export type Axis = (typeof AXES)[number];

export const REVIEW_STATUSES = ["후보", "선정", "제외"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// 축8 사업정체성 정합성 (LLM 판정)
export const MATCH_TYPES = ["직접일치", "간접관련", "무관", "판단유보"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];
export type AlignmentSource = "whitelist" | "llm" | "pending";

// 축9 BTP 지원이력 flag (스코어 미포함)
export const FLAG_STATUSES = ["flag", "cleared", "observe", "normal", "unknown"] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];
export const SEGMENTS = ["소액다건", "대형소수", "대형다건", "소액소수"] as const;
export type Segment = (typeof SEGMENTS)[number];

export type AxisScores = Record<Axis, number | null>;

// 종합점수 그룹(재무/기술/정합성) + 재무 세부축 이름. 프론트 가중치 조정 UI가 참조.
export const COMPOSITE_GROUPS = ["finance", "tech", "alignment"] as const;
export type CompositeGroup = (typeof COMPOSITE_GROUPS)[number];

// compositeScore.breakdown 키 — 재무4축 + 기술2축 + 정합성. 백엔드 composite_score.py와 동일.
export const COMPOSITE_AXES = ["성장성", "수익성", "효율성", "안정성", "R&D특허", "NTIS", "정합성"] as const;
export type CompositeAxis = (typeof COMPOSITE_AXES)[number];

// 종합점수(심사 스크리닝용 보조 지표) — docs/종합점수_설계노트.md.
// 축별 breakdown이 진짜 판단 근거이므로 항상 함께 노출할 것(종합점수 단독 표기 금지).
export interface CompositeScore {
  score: number | null;               // min(가중평균, 최저축+cap_margin)
  rawWeightedAverage: number | null;  // 캡 적용 전 가중평균(참고용)
  lowestAxis: CompositeAxis | null;
  lowestAxisScore: number | null;
  validAxisRatio: number;
  breakdown: Record<CompositeAxis, number | null>;
}

export interface TrendPoint {
  year: number;
  value: number | null;
}

export interface SupportRecord {
  date: string; // YYYY-MM-DD
  result: "선정" | "탈락" | "포기";
  bizType: string;
  amount: number; // 천원 (탈락/포기는 0)
  programCode: string | null; // support_programs.program_code 조인키(연도+코드가 PK)
  programName: string | null; // support_programs.program_name 조인 — 결측이면 화면에서 programCode로 폴백
  year: number | null;
  startDate: string | null; // 수행 시작일 — 동시 수혜(기간 겹침) 판정용
  endDate: string | null;   // 수행 종료일
  // 지원구분 — 한 사업(선정) 안에서도 여러 지원항목을 동시에 받을 수 있다.
  supportDetailMain: string | null;
  supportDetailOther: string | null; // 패키지지원 유형에서만 채워짐(그 외는 결측)
  supportItem: string | null;
}

// 축8 개별 지원사업 정합성 판정
export interface AlignmentJudgment {
  programCode: string;
  year: number;
  programName: string | null;
  businessType: string | null;
  score: number | null;
  matchType: MatchType;
  matchedKeywords: string[];
  reasoning: string;
  source: AlignmentSource;
}

// 축8 종합 정합성 (스코어카드 상단·리스트용)
export interface BusinessFit {
  score: number | null;             // 판정 완료분 평균
  matchType: MatchType;             // 대표 판정 (majority)
  summary: string;                  // 자연어 요약
  totalJudged: number;              // 판정 완료 건수
  totalPending: number;             // LLM 대기 건수
  breakdown: Record<string, number>; // {직접일치, 간접관련, 무관, 판단유보}
  judgments: AlignmentJudgment[];
}

// 축9 반복지원 flag (스코어 미포함)
export interface DuplicateFlag {
  status: FlagStatus;
  label: string;
  isRepeat: boolean;
  growthState: "stagnant" | "growing" | "unknown";
  segment: Segment | null;
  isHighDiversity: boolean;
  supportCount: number;
  totalAmountThousand: number;
  businessTypeDiversity: number;
  maxConsecutiveYears: number;
  // 성장 판정 근거 — 축1(민지) 산출 소비. null/undefined는 축1 미연결·자본잠식 등.
  // 근거 카드에서 임계값(하위 30%) 대비 노출용. 옵셔널로 둔 이유: 배포된 fixture
  // 스냅샷들이 이 필드 없이 저장돼 있어 신규 필드 확장 시 하위 호환을 위해.
  growthScore?: number | null;   // 0~100 백분위. 30 미만 = 정체
  revenueCagr?: number | null;   // decimal (0.15 = 15%)
  revenueDelta?: number | null;  // 천원 단위 매출 증가액
}

export interface Company {
  id: number;
  name: string;
  industry: string | null;
  industryCode: string | null;
  region: string | null;
  revenueLatest: number | null; // 천원
  avgSalaryLatest: number | null; // 천원(원본 "원" 단위를 /1000으로 통일)
  // 기업 기본 상태(CRETOP식 기본 식별 정보 — 심사 전 "살아있는·검증된 기업인가" 확인)
  foundedDate: string | null;   // 설립일(YYYY-MM-DD). 업력 계산 원천
  companyStatus: string | null; // 기업상태 텍스트("정상" 등)
  isClosed: boolean;            // 휴·폐업 여부 — 지원 대상에서 즉시 걸러야 하는 신호
  closureType: string | null;   // 휴폐업 구분(휴업/폐업). isClosed일 때만 의미
  capitalThousand: number | null; // 납입자본금(천원). 기업 규모 맥락
  listingType: string | null;   // 상장구분(코스피/코스닥) 또는 외감구분(외감/일반법인) — 값 그대로, 해석은 배지에서
  scores: AxisScores;
  percentiles: Record<string, number | null>; // 파생컬럼 → 0~100 백분위
  rawMetrics: Record<string, number | null>; // 파생컬럼 원값
  trends: Record<string, TrendPoint[]>;
  certifications: Record<string, boolean>;
  patents: { 등록: number | null; 출원: number | null };
  ntis: { 주관: number | null; 위탁: number | null };
  // 건수 = 지원 항목수(행 수, 패키지 세부품목 포함) / 선정건수 = 실제 선정된 사업 수.
  // 반복·중복 판정은 선정건수 기준(lib/duplicate-risk.ts도 supportHistory에서 동일 기준으로 계산).
  support: { 건수: number | null; 선정건수: number | null; 총지원금_천원: number | null; 지원연도수: number | null };
  supportHistory: SupportRecord[];
  passthrough: {
    영업외손익비중: number | null;
    자본잠식_플래그: number | null;
    영업외의존_연수: number | null;
    재무관측연수: number | null;
    이직률_최근: number | null;
    고용회전율_최근: number | null;
    고용순증_최근: number | null;
    고용관측연수: number | null;
  };
  employment?: {
    // 안정성 (배지 · 국민연금 펼침표)
    회전율백분위: number | null;
    series: { year: number; 가입: number | null; 취업: number | null; 퇴직: number | null }[] | null;
    // 규모 · 변화
    종업원수_최근?: number | null;
    종업원수_CAGR?: number | null;        // decimal
    종업원수_증감_5년?: number | null;    // 명
    종업원수증가_백분위?: number | null;
    // 처우 (급여 단위=원, 원본 그대로 — 프론트가 화면 표기 시 환산)
    급여_최근_원?: number | null;
    급여_CAGR?: number | null;            // decimal
    급여_백분위?: number | null;
    // 인력 생산성
    인당매출_최근_천원?: number | null;
    인당매출_백분위?: number | null;
    인당영업이익_최근_천원?: number | null;
    // 규모·처우 트렌드 (스파크라인)
    scaleSeries?: { year: number; 종업원수: number | null; 급여_원: number | null }[] | null;
  } | null;
  nonopIncome?: {
    series: { year: number; 영업이익: number | null; 당기순이익: number | null }[] | null;
  } | null;
  percentileBasis: string | null; // "업종내" | "전체fallback"
  dataQuality: { missing: string[]; inconsistencies?: { rule: string; detail: string; category?: string }[]; ok: boolean };
  _mock: string[]; // 목업으로 채운 필드(투명성)
  reviewStatus: ReviewStatus; // 찜 상태. company_review_status 테이블에 영속화(PATCH /companies/{id}/review-status)
  businessFit: BusinessFit | null;     // 축8 (LLM 정합성 판정)
  duplicateFlag: DuplicateFlag | null; // 축9 (반복지원 flag)
  tech: Tech | null;                   // 축4·5·6 기술력(원장 기반)
  compositeScore: CompositeScore | null; // 재무4축+기술2축+정합성, 최저축 캡 적용
}

// 축4 R&D·특허 / 축5 인증 / 축6 NTIS / 축4-1 기술도메인.
// patents·ntis(위 상단 필드)는 원장 집계값으로 교체됨 — master 집계컬럼은 신뢰 불가
// (특허=비단조 flow + 상표·디자인 혼입 / NTIS=스냅샷 중복 약 2.9배).
export interface Tech {
  patents: {
    출원: number | null;
    등록: number | null;
    등록전환율: number | null;   // 등록÷출원 — 특허의 질
    최근3년출원: number | null;  // 활동성
    최근출원비중: number | null;
    활동공백년수: number | null; // 마지막 출원 이후 경과(클수록 R&D 정체)
    소멸률: number | null;       // 등록특허 권리 소멸 비율(자금압박 신호)
    첫특허업력: number | null;
    // 등록 특허 중 대표이사·임원 개인 명의 건수. 법인이 아닌 개인 자산이라
    // 대표 이탈 시 회사에 남지 않는다(등록 대비 비중이 높으면 IP 소실 위험).
    대표개인명의_등록: number | null;
  };
  rnd: { 집약도: number | null; 집약도추세: number | null };
  ntis: {
    주관과제수: number | null;
    정부연구비_원: number | null; // ⚠️ 단위 원(재무는 천원)
    민간연구비_원: number | null; // 정부 과제에 매칭한 민간(자체) 연구비. 단위 원
    민간부담률: number | null;    // 민간÷연구비합계(0~1). 자기 자본 매칭 비율. null=정부R&D 없음
    최근수주연도: number | null;  // 최신 정부 과제 착수연도. null=정부R&D 없음
    진행중과제수: number | null;  // 데이터 스냅샷 기준 총연구기간 진행 중인 과제 수
    부처다양성: number | null;
    위탁과제수: number | null;
    산학협력: boolean;
  };
  certification: {
    보유수: number | null;
    핵심보유: boolean;
    실체괴리: boolean;           // 핵심인증 보유 + 등록특허0 + 국가R&D0
  };
  domain: {
    주력기술분야: string | null;
    출처: string | null;         // "표준분류" | "KSIC추정" | "미상"
    분야수: number | null;
    집중도: number | null;       // HHI — 1=단일분야 전문
    btp중점사업: string[];
    국가전략기술: string[];      // 12대 국가전략기술
    기술수준등급: string | null; // OECD 고위/중고위/중저위/저위
    지역전략산업: string | null;       // 부산 9대 전략산업(제6차) 매칭명
    지역전략산업_매칭유형: string | null; // "고유"(강함) | "공통"(약함)
    지역전략산업_부합: boolean;
  };
  scores: {
    rndPatent: number | null;
    ntis: number | null;
    백분위기준: string | null;
  };
  // 지표별 동종 대비 백분위(0~100). 절대값만으로는 "많은 건지" 알 수 없어 함께 제공.
  // ⚠️ scores.백분위기준이 "전체fallback"이면 동종 표본 부족 — 화면에 표기할 것.
  percentiles: Record<string, number | null>;
  // 드릴다운 — 집계 숫자("등록 N건")의 근거. 같은 기준(기술 IP만)으로 필터됨.
  patentList: PatentRecord[];
}

export interface PatentRecord {
  type: string | null;       // 특허권 / 실용신안권
  status: string | null;     // 등록 / 공개(출원 계류)
  applied: string | null;
  registered: string | null;
  valid: boolean | null;     // false면 권리 소멸
  // 회사와의 관계: 본인(법인)/대표이사/임원. 대표이사·임원=개인 명의라
  // 법인 자산이 아니다(대표 이탈 시 회사에 남지 않음). null=미상.
  relation: string | null;
}

// support_programs(실사업 목록) + support_records 집계. macroCategory는 원본 시트 간
// 표기가 혼재돼 있어(예: support_records.business_type엔 없는 'RnD'가 여기 있음) 필터는
// businessType 기준으로 쓴다.
export interface Program {
  year: number;
  programCode: string;
  name: string | null;
  macroCategory: string | null;
  businessType: string | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  ministry: string | null;
  localGov: string | null;
  description: string | null;
  applicantCount: number;
  selectedCount: number;
  totalAmountThousand: number;
  // 선정 건 중 지원금 결측 건수. 합계는 결측을 0으로 더하므로 "0원"과 "미기재"를 구분하려면 이 값이 필요하다.
  amountMissingCount: number;
  detailItems: string[]; // 세부품목(support_detail_main) distinct. 신청이력 없으면 빈 배열.
}

export interface RankingRow {
  id: number;
  name: string;
  industry: string | null;
  건수: number | null;    // 선정된 사업 수(반복선정 랭킹 정렬 기준)
  항목수: number | null;  // 지원 항목수(행 수 — 패키지 세부품목 포함). 근거 표시용
  총지원금_천원: number | null;
}

export interface Rankings {
  byCount: RankingRow[];
  byAmount: RankingRow[];
}

export interface Dashboard {
  totalCompanies: number;
  bizTypeDist: { type: string; count: number }[];
  regionDist: { region: string; count: number }[];
  resultDist: { result: string; count: number }[];
  dataQualityIssues: number;
}

// 메모 — 담당자가 심사하며 남기는 기록. 본문에 @기업·#사업 멘션을 인라인 마크업으로 포함.
export interface NoteMention {
  targetType: "company" | "program";
  companyId: number | null;
  programYear: number | null;
  programCode: string | null;
}

export interface Note {
  id: number;
  body: string;   // @[기업 1049](company:1049) 형태 마크업 포함 원문
  author: string; // 작성 시점 role 라벨
  createdAt: string;
  updatedAt: string;
  mentions: NoteMention[];
}

// 챗봇 — action에 따라 채워지는 필드가 다르다.
//   navigate: path 채움. 프론트가 router.push. sql/columns/rows 비어있음.
//   query:    sql/columns/rows/answer 전부 채움. path=null.
//   clarify:  answer만 채움 (요청 처리 불가 사유).
export type ChatbotAction = "navigate" | "query" | "clarify";

export interface ChatbotAnswer {
  question: string;
  action: ChatbotAction;
  intent: string;
  path: string | null;
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  answer: string;
  error: string | null;
}
