// 재무 축 산출물 + master 기반 프론트 타입.
// fixture(JSON)와 향후 FastAPI 응답이 동일 스키마를 따른다.

export const AXES = ["성장성", "수익성", "효율성", "안정성"] as const;
export type Axis = (typeof AXES)[number];

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
}

export interface Company {
  id: number;
  name: string;
  industry: string | null;
  industryCode: string | null;
  region: string | null;
  revenueLatest: number | null; // 천원
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

// 각 축에 속한 파생컬럼(백분위 드릴다운용) — scoring_finance.py의 SCORE_COLS와 동일
export const AXIS_METRICS: Record<Axis, string[]> = {
  성장성: ["매출_CAGR", "매출_성장안정성", "매출_성장가속도", "자산_CAGR", "자산_성장안정성", "자산_성장가속도"],
  수익성: ["영업이익률_최근", "순이익률_최근", "매출총이익률_최근", "ROA", "ROE", "판관비율", "흑자지속성", "수익성추세", "ROA추세", "ROE추세"],
  효율성: ["총자산회전율"],
  안정성: ["부채비율_최근", "자기자본비율", "자본잠식정도", "이익잉여금축적", "부채비율추세"],
};
