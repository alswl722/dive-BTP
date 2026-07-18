// 재무 축 산출물 + master 기반 프론트 타입.
// fixture(JSON)와 향후 FastAPI 응답이 동일 스키마를 따른다.

export const AXES = ["성장성", "수익성", "효율성", "안정성"] as const;
export type Axis = (typeof AXES)[number];

export const REVIEW_STATUSES = ["후보", "선정", "보류", "제외"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

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
