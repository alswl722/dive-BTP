// 재무 축 산출물 + master 기반 프론트 타입.
// fixture(JSON)와 향후 FastAPI 응답이 동일 스키마를 따른다.

export const AXES = ["성장성", "수익성", "효율성", "안정성"] as const;
export type Axis = (typeof AXES)[number];

export const REVIEW_STATUSES = ["후보", "선정", "보류", "제외"] as const;
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
  year: number | null;
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
}

export interface Company {
  id: number;
  name: string;
  industry: string | null;
  industryCode: string | null;
  region: string | null;
  revenueLatest: number | null; // 천원
  avgSalaryLatest: number | null; // 천원(원본 "원" 단위를 /1000으로 통일)
  scores: AxisScores;
  percentiles: Record<string, number | null>; // 파생컬럼 → 0~100 백분위
  rawMetrics: Record<string, number | null>; // 파생컬럼 원값
  trends: Record<string, TrendPoint[]>;
  certifications: Record<string, boolean>;
  patents: { 등록: number | null; 출원: number | null };
  ntis: { 주관: number | null; 위탁: number | null };
  support: { 건수: number | null; 총지원금_천원: number | null; 지원연도수: number | null };
  supportHistory: SupportRecord[];
  passthrough: { 영업외손익비중: number | null; 자본잠식_플래그: number | null };
  percentileBasis: string | null; // "업종내" | "전체fallback"
  dataQuality: { missing: string[]; ok: boolean };
  _mock: string[]; // 목업으로 채운 필드(투명성)
  reviewStatus: ReviewStatus; // 찜 상태. company_review_status 테이블에 영속화(PATCH /companies/{id}/review-status)
  businessFit: BusinessFit | null;     // 축8 (LLM 정합성 판정)
  duplicateFlag: DuplicateFlag | null; // 축9 (반복지원 flag)
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
  건수: number | null;
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
