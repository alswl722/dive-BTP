import type { Company, SupportRecord } from "@/types";

export const DUPLICATE_RISK_THRESHOLD = 3; // CLAUDE.md 반복선정 규칙 기준(GROUP BY ... HAVING COUNT>=N). 실제 심사 가이드라인 재확인 필요.
export const DUPLICATE_RISK_WINDOW_YEARS = 3;

// 사업연도(support_programs.year, program-progress.ts의 companyProgramKeys가 쓰는 것과 동일 필드)를
// 우선 쓴다 — 선정일(date)이 다음 회계연도로 넘어가는 레코드가 있으면 date 기준 연도와 어긋날 수 있다.
export function recordYear(h: SupportRecord): number {
  return h.year ?? Number(h.date.slice(0, 4));
}

/** "최근 3년" 기준연도. 오늘 날짜(2026)가 아니라 데이터셋의 최신 지원이력 연도를 기준으로 삼는다
 *  — 샘플 지원이력은 2020~2024년뿐이라 오늘 날짜 기준 최근 3년으로 계산하면 표본이 전부 0건이 된다. */
export function latestSupportYear(companies: Company[]): number {
  let max = 0;
  for (const c of companies) {
    for (const h of c.supportHistory) {
      const y = recordYear(h);
      if (y > max) max = y;
    }
  }
  return max || new Date().getFullYear();
}

/** 최근 N년(latestSupportYear 기준) 내 "선정" 건수. */
export function recentSelectionCount(company: Company, latestYear: number, windowYears = DUPLICATE_RISK_WINDOW_YEARS): number {
  const from = latestYear - windowYears + 1;
  return company.supportHistory.filter((h) => h.result === "선정" && recordYear(h) >= from && recordYear(h) <= latestYear).length;
}

export function isDuplicateRisk(company: Company, latestYear: number): boolean {
  return recentSelectionCount(company, latestYear) >= DUPLICATE_RISK_THRESHOLD;
}

export type RiskLevel = "낮음" | "보통" | "높음" | "매우높음";

/** 최근 3년 선정건수 → 위험도 등급(임의 구간, 실제 심사 가이드라인 확정 전 임시). */
export function riskLevel(count: number): RiskLevel {
  if (count >= 5) return "매우높음";
  if (count >= 3) return "높음";
  if (count >= 1) return "보통";
  return "낮음";
}

export const RISK_LEVEL_BADGE: Record<RiskLevel, "bad" | "warn" | "info" | "good"> = {
  매우높음: "bad",
  높음: "warn",
  보통: "info",
  낮음: "good",
};

/** 연도별 선정건수 맵 (최근 windowYears개년). */
export function selectionsByYear(company: Company, latestYear: number, windowYears = DUPLICATE_RISK_WINDOW_YEARS) {
  const from = latestYear - windowYears + 1;
  const years = Array.from({ length: windowYears }, (_, i) => from + i);
  return years.map((year) => ({
    year,
    count: company.supportHistory.filter((h) => h.result === "선정" && recordYear(h) === year).length,
  }));
}
