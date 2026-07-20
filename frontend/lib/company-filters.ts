import { AXES, type Axis, type Company, type ReviewStatus } from "@/types";
import { computeOverallScore, DEFAULT_AXIS_WEIGHTS } from "@/lib/scoring";
import { isDuplicateRisk } from "@/lib/duplicate-risk";

export interface CompanyFilters {
  q: string;
  industries: string[];
  regions: string[];
  minOverall: number;
  minAxis: Record<Axis, number>;
  certs: string[];
  minSupportYears: number;
  excludeQualityIssues: boolean;
  qualityIssueOnly: boolean;
  dupRiskOnly: boolean;
  programKey: string | null; // "year:code"
}

export function defaultFilters(): CompanyFilters {
  return {
    q: "",
    industries: [],
    regions: [],
    minOverall: 0,
    minAxis: { 성장성: 0, 수익성: 0, 효율성: 0, 안정성: 0 },
    certs: [],
    minSupportYears: 0,
    excludeQualityIssues: false,
    qualityIssueOnly: false,
    dupRiskOnly: false,
    programKey: null,
  };
}

export function applyFilters(
  companies: Company[],
  filters: CompanyFilters,
  weights: Record<Axis, number>,
  latestYear: number,
  programApplicantKeySet: (c: Company) => Set<string> // 기업이 신청한 "year:code" 집합
): Company[] {
  const q = filters.q.trim().toLowerCase();
  return companies.filter((c) => {
    if (q && !(String(c.id).includes(q) || c.name.toLowerCase().includes(q) || (c.industry ?? "").toLowerCase().includes(q))) return false;
    if (filters.industries.length && !(c.industry && filters.industries.includes(c.industry))) return false;
    if (filters.regions.length && !(c.region && filters.regions.includes(c.region))) return false;
    const overall = computeOverallScore(c.scores, weights);
    if (filters.minOverall > 0 && (overall == null || overall < filters.minOverall)) return false;
    for (const axis of AXES) {
      const min = filters.minAxis[axis];
      if (min > 0 && (c.scores[axis] == null || (c.scores[axis] as number) < min)) return false;
    }
    if (filters.certs.length && !filters.certs.every((cert) => c.certifications[cert])) return false;
    if (filters.minSupportYears > 0 && (c.support.지원연도수 ?? 0) < filters.minSupportYears) return false;
    if (filters.excludeQualityIssues && !c.dataQuality.ok) return false;
    if (filters.qualityIssueOnly && c.dataQuality.ok) return false;
    if (filters.dupRiskOnly && !isDuplicateRisk(c, latestYear)) return false;
    if (filters.programKey && !programApplicantKeySet(c).has(filters.programKey)) return false;
    return true;
  });
}

export type SortKey = "revenueLatest" | "overall" | "supportCount" | "techScore";
export type SortDir = "asc" | "desc";

export function sortCompanies(companies: Company[], key: SortKey, dir: SortDir, weights: Record<Axis, number>): Company[] {
  const factor = dir === "asc" ? 1 : -1;
  const valueOf = (c: Company): number => {
    if (key === "revenueLatest") return c.revenueLatest ?? -Infinity;
    if (key === "supportCount") return c.support.건수 ?? -Infinity;
    // 기술 데이터가 없는 기업은 항상 뒤로 — 0점과 '데이터 없음'을 같이 두면 안 된다
    if (key === "techScore") return c.tech?.scores.rndPatent ?? -Infinity;
    return computeOverallScore(c.scores, weights) ?? -Infinity;
  };
  return [...companies].sort((a, b) => (valueOf(a) - valueOf(b)) * factor);
}

export function reviewStatusCounts(companies: Company[], statuses: Record<number, ReviewStatus>) {
  const counts: Record<ReviewStatus, number> = { 후보: 0, 선정: 0, 보류: 0, 제외: 0 };
  for (const c of companies) {
    const s = statuses[c.id] ?? c.reviewStatus;
    counts[s]++;
  }
  return counts;
}

export { DEFAULT_AXIS_WEIGHTS };
