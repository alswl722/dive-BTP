import type { Program, Company } from "@/types";

/** "오늘" 기준일. 실제 오늘(2026)로 계산하면 표본 지원이력(2022~2024)과 겹치는 진행중 사업이
 *  0건이라 신청 이력이 있는 사업들의 최신 마감일(데이터 마지막 시점)을 기준일로 삼는다. */
export function dashboardReferenceDate(programs: Program[]): Date {
  const times = programs
    .filter((p) => p.applicantCount > 0 && p.endDate)
    .map((p) => new Date(p.endDate + "T00:00:00").getTime());
  if (!times.length) return new Date();
  return new Date(Math.max(...times));
}

export function activePrograms(programs: Program[], ref: Date): Program[] {
  const t = ref.getTime();
  return programs.filter(
    (p) =>
      p.applicantCount > 0 &&
      p.startDate &&
      p.endDate &&
      new Date(p.startDate + "T00:00:00").getTime() <= t &&
      new Date(p.endDate + "T00:00:00").getTime() >= t
  );
}

/** 이 사업(연도+코드)에 신청한 기업 id 목록. support_records 매칭. */
export function programApplicantIds(program: Program, companies: Company[]): number[] {
  return companies
    .filter((c) => c.supportHistory.some((h) => h.year === program.year && h.programCode === program.programCode))
    .map((c) => c.id);
}

export function programKey(p: Program): string {
  return `${p.year}:${p.programCode}`;
}

/** 이 기업이 신청 이력을 가진 사업의 "year:code" 집합. */
export function companyProgramKeys(c: Company): Set<string> {
  return new Set(c.supportHistory.filter((h) => h.programCode && h.year).map((h) => `${h.year}:${h.programCode}`));
}
