import type { Company, Program } from "@/types";
import { resolveProgramStatus, type ProgramStatus } from "@/lib/program-status";

/** 지원사업 목록 필터 상태. 화면 컨트롤과 1:1. */
export interface ProgramFilters {
  q: string;
  year: string; // "전체" | "2024" …
  businessType: string | null; // null = 전체
  detailItems: string[]; // 빈 배열 = 전체(다중 선택, OR 매칭)
  ministry: string | null;
  status: ProgramStatus | null;
}

export const defaultProgramFilters = (): ProgramFilters => ({
  q: "",
  year: "전체",
  businessType: null,
  detailItems: [],
  ministry: null,
  status: null,
});

export type ProgramSortKey = "year" | "name" | "applicants" | "selected" | "amount";
export type SortDir = "asc" | "desc";

export function programKeyOf(p: Program) {
  return `${p.year}:${p.programCode}`;
}

/** 사업유형 그룹핑 키 — null은 "미분류"로 모은다(필터·집계 양쪽에서 동일하게 써야 함). */
export const bizTypeKey = (p: Program) => p.businessType ?? "미분류";

/** 사업명 매칭 키 — 같은 사업인데 연도마다 띄어쓰기가 다른 경우가 있다.
 *  실측: "지역기업성장사다리지원사업"(2024) vs "지역기업 성장사다리 지원사업"(2023) 등 4쌍.
 *  공백을 제거해 비교해야 다년도 묶음이 제대로 걸린다. */
export const programNameKey = (name: string | null, fallback: string) =>
  (name ?? fallback).replace(/\s+/g, "");

export function applyProgramFilters(
  programs: Program[],
  f: ProgramFilters,
  referenceDate: Date,
  // 관리자가 지정한 상태 — 없으면 일정 기준 자동 판정
  statusOverrides?: Record<string, ProgramStatus>
): Program[] {
  const q = f.q.trim().toLowerCase();
  return programs.filter((p) => {
    if (q) {
      // 사업명 없는 행은 코드로도 찾을 수 있게 한다.
      const hay = `${p.name ?? ""} ${p.programCode} ${p.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.year !== "전체" && String(p.year) !== f.year) return false;
    if (f.businessType && bizTypeKey(p) !== f.businessType) return false;
    if (f.detailItems.length > 0 && !f.detailItems.some((d) => p.detailItems.includes(d))) return false;
    if (f.ministry && (p.ministry ?? "미상") !== f.ministry) return false;
    if (f.status && resolveProgramStatus(p, referenceDate, statusOverrides) !== f.status) return false;
    return true;
  });
}

export function sortPrograms(programs: Program[], key: ProgramSortKey, dir: SortDir): Program[] {
  const sign = dir === "asc" ? 1 : -1;
  // localeCompare는 서버/브라우저 콜레이션이 달라 hydration mismatch를 내므로 코드유닛 비교를 쓴다.
  const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...programs].sort((a, b) => {
    switch (key) {
      case "name":
        return sign * cmpStr(a.name ?? a.programCode, b.name ?? b.programCode);
      case "applicants":
        return sign * (a.applicantCount - b.applicantCount);
      case "selected":
        return sign * (a.selectedCount - b.selectedCount);
      case "amount":
        return sign * (a.totalAmountThousand - b.totalAmountThousand);
      case "year":
      default:
        return sign * (a.year - b.year) || sign * (a.applicantCount - b.applicantCount);
    }
  });
}

export interface ProgramSummary {
  count: number;
  totalAmountThousand: number;
  selectedTotal: number;
  /** 신청 기록이 매칭된 사업 수 — 나머지는 "표본에 기록 없음"이라 0 집계에서 빼고 읽어야 한다. */
  withRecords: number;
}

export function summarizePrograms(programs: Program[]): ProgramSummary {
  return {
    count: programs.length,
    totalAmountThousand: programs.reduce((s, p) => s + p.totalAmountThousand, 0),
    selectedTotal: programs.reduce((s, p) => s + p.selectedCount, 0),
    withRecords: programs.filter((p) => p.applicantCount > 0).length,
  };
}

/* ------------------------------------------------------------------ */
/* 사업 ↔ 기업 연결 (companies.supportHistory 기준 클라이언트 조인)     */
/* ------------------------------------------------------------------ */

/** 이 사업에 선정된 기업들. */
export function selectedCompanies(program: Program, companies: Company[]): Company[] {
  return companies.filter((c) =>
    c.supportHistory.some(
      (h) => h.result === "선정" && h.year === program.year && h.programCode === program.programCode
    )
  );
}

export interface CoSupportedProgram {
  /** 사업명 기준 묶음 — 같은 사업의 다른 연도는 한 항목으로 합친다. */
  name: string;
  years: number[];
  /** 이 사업 선정자 중 해당 사업(연도 무관)도 받은 기업 수 */
  overlapCount: number;
  /** 겹치는 기업 id — "몇 개사"라는 숫자 뒤에 실제 어떤 기업인지 화면에서 보여주기 위함 */
  companyIds: number[];
  /** 기업 id → 그 기업이 이 사업(명)에 선정된 연도. 기업마다 다를 수 있어 위 `years`(전체 합)와 분리한다. */
  yearsByCompany: Record<number, number[]>;
}

/** "의미 있는 겹침" 판정선.
 *
 * 절대값만 쓰면 큰 사업에서 무의미해지고(선정 50개사에 2개사 겹침은 우연),
 * 비율만 쓰면 작은 사업에서 과민해진다(선정 2개사에 1개사 = 50%).
 * 그래서 둘의 최댓값을 쓴다. 본선 데이터의 기저율을 보고 조정할 값이라 상수로 분리.
 */
export const CO_SUPPORT_MIN_COMPANIES = 2;
export const CO_SUPPORT_MIN_RATIO = 0.1;

export function coSupportThreshold(selectedCount: number): number {
  return Math.max(CO_SUPPORT_MIN_COMPANIES, Math.ceil(selectedCount * CO_SUPPORT_MIN_RATIO));
}

/** 이 사업 선정자들이 "함께 받은" 다른 사업 — 사업명으로 묶어 겹치는 기업 수 순.
 *
 * 비율(선정자 중 N%)은 화면에 쓰지 않는다. 현재 표본은 11개 기업 전원이 반복 수혜자라
 * 분모가 오염돼 어떤 사업이든 100%에 가깝게 나온다(발제사 큐레이션 특성).
 * 겹치는 "기업 수"는 표본 편향과 무관한 사실이라 이것만 노출한다.
 *
 * 연도별로 쪼개면 같은 사업이 여러 줄을 차지해 목록이 길어진다. 본선 데이터는
 * 415개 사업 중 263개가 2년 이상 반복이므로 사업명 묶음의 효과가 크다.
 */
export function coSupportedPrograms(
  program: Program,
  companies: Company[],
  allPrograms: Program[]
): CoSupportedProgram[] {
  const selected = selectedCompanies(program, companies);
  if (selected.length === 0) return [];

  const nameByKey = new Map(allPrograms.map((p) => [programKeyOf(p), p.name ?? p.programCode]));
  const selfKey = programKeyOf(program);
  const selfNameKey = programNameKey(program.name, program.programCode);

  // 정규화 키 → { 표시용 원본명, 겹친 기업 id 집합, 연도 집합, 기업별 연도 집합 }.
  const agg = new Map<
    string,
    { label: string; companies: Set<number>; years: Set<number>; yearsByCompany: Map<number, Set<number>> }
  >();

  for (const c of selected) {
    for (const h of c.supportHistory) {
      if (h.result !== "선정" || h.year == null || !h.programCode) continue;
      const key = `${h.year}:${h.programCode}`;
      if (key === selfKey) continue;
      const label = nameByKey.get(key) ?? h.programCode;
      const nameKey = programNameKey(label, h.programCode);
      if (nameKey === selfNameKey) continue; // 같은 사업의 다른 연도는 "동일 사업 반복"에서 따로 읽는다
      const cur =
        agg.get(nameKey) ?? { label, companies: new Set<number>(), years: new Set<number>(), yearsByCompany: new Map<number, Set<number>>() };
      cur.companies.add(c.id);
      cur.years.add(h.year);
      const companyYears = cur.yearsByCompany.get(c.id) ?? new Set<number>();
      companyYears.add(h.year);
      cur.yearsByCompany.set(c.id, companyYears);
      agg.set(nameKey, cur);
    }
  }

  return Array.from(agg.values())
    .map((v) => ({
      name: v.label,
      years: Array.from(v.years).sort((a, b) => a - b),
      overlapCount: v.companies.size,
      companyIds: Array.from(v.companies),
      yearsByCompany: Object.fromEntries(
        Array.from(v.yearsByCompany.entries()).map(([id, s]) => [id, Array.from(s).sort((a, b) => a - b)])
      ),
    }))
    .sort((a, b) => b.overlapCount - a.overlapCount || (a.name < b.name ? -1 : 1));
}

export interface SameProgramRepeat {
  /** 이 사업을 다른 연도에도 받은 기업 수 */
  companyCount: number;
  /** 반복 수혜가 발생한 연도 전체(기업들을 통틀어) — 특정 기업 하나의 반복 연도와는 다를 수 있다 */
  years: number[];
  /** 반복 수혜 기업 id — "몇 개사"라는 숫자 뒤에 실제 어떤 기업인지 화면에서 보여주기 위함 */
  companyIds: number[];
  /** 기업 id → 그 기업이 실제로 반복 수혜받은 연도. 기업마다 다를 수 있어 위 `years`(전체 합)와 분리한다. */
  yearsByCompany: Record<number, number[]>;
}

/** 같은 사업을 다른 연도에도 받은 기업 — "매년 같은 기업이 받는가" 신호.
 *
 * 코드가 연도마다 달라지는 사업이 있어(예: B1_311 ↔ B1_1_3) 사업명으로 매칭한다.
 * 함께 받은 사업 목록에서는 이 항목을 빼고 여기서 따로 강조한다 — 다른 사업과
 * 겹치는 것보다 "같은 사업을 반복 수혜"가 심사자에게 훨씬 강한 신호이기 때문.
 */
export function sameProgramRepeat(
  program: Program,
  companies: Company[],
  allPrograms: Program[]
): SameProgramRepeat {
  const selfKey = programKeyOf(program);
  const selfNameKey = programNameKey(program.name, program.programCode);
  const nameByKey = new Map(allPrograms.map((p) => [programKeyOf(p), p.name ?? p.programCode]));

  const ids = new Set<number>();
  const years = new Set<number>();
  const yearsByCompany = new Map<number, Set<number>>();
  for (const c of selectedCompanies(program, companies)) {
    for (const h of c.supportHistory) {
      if (h.result !== "선정" || h.year == null || !h.programCode) continue;
      const key = `${h.year}:${h.programCode}`;
      if (key === selfKey) continue;
      const label = nameByKey.get(key) ?? h.programCode;
      if (programNameKey(label, h.programCode) !== selfNameKey) continue;
      ids.add(c.id);
      years.add(h.year);
      const companyYears = yearsByCompany.get(c.id) ?? new Set<number>();
      companyYears.add(h.year);
      yearsByCompany.set(c.id, companyYears);
    }
  }
  return {
    companyCount: ids.size,
    years: Array.from(years).sort((a, b) => a - b),
    companyIds: Array.from(ids),
    yearsByCompany: Object.fromEntries(
      Array.from(yearsByCompany.entries()).map(([id, s]) => [id, Array.from(s).sort((a, b) => a - b)])
    ),
  };
}

/** 목록 배지용 — 선정자 중 다른 사업도 받은 기업 수(비율 아님). */
export function overlapCompanyCount(program: Program, companies: Company[]): number {
  return selectedCompanies(program, companies).filter((c) => {
    const keys = new Set(
      c.supportHistory
        .filter((h) => h.result === "선정" && h.year != null && h.programCode)
        .map((h) => `${h.year}:${h.programCode}`)
    );
    keys.delete(programKeyOf(program));
    return keys.size > 0;
  }).length;
}

/* ------------------------------------------------------------------ */
/* CSV 내보내기                                                        */
/* ------------------------------------------------------------------ */

/** 셀 이스케이프 — 사업명에 쉼표·따옴표·줄바꿈이 실제로 들어있다. */
function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADERS = [
  "연도", "사업코드", "사업명", "사업유형", "사업구분", "세부품목",
  "부처", "지자체", "시작일", "종료일", "상태",
  "신청기업수", "선정기업수", "총지원금(천원)", "지원금결측건수", "사업설명",
];

/** 화면 표시가 아닌 원값으로 내보낸다(엑셀에서 합계·정렬해야 하므로).
 *  신청 기록이 없는 사업은 신청/선정/금액을 빈 칸으로 — 0과 구분이 사라지면 안 된다. */
export function programsToCsv(
  programs: Program[],
  referenceDate: Date,
  statusOverrides?: Record<string, ProgramStatus>
): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const p of programs) {
    const noRecord = p.applicantCount === 0;
    lines.push(
      [
        p.year,
        p.programCode,
        p.name,
        p.businessType ?? "미분류",
        p.macroCategory,
        p.detailItems.join(" · "),
        p.ministry,
        p.localGov,
        p.startDate,
        p.endDate,
        resolveProgramStatus(p, referenceDate, statusOverrides),
        noRecord ? "" : p.applicantCount,
        noRecord ? "" : p.selectedCount,
        noRecord || p.selectedCount === 0 ? "" : p.totalAmountThousand,
        p.amountMissingCount ?? 0,
        p.description,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\r\n");
}

export function csvFileName(f: ProgramFilters, today: Date): string {
  const parts = ["부산TP_지원사업"];
  if (f.year !== "전체") parts.push(f.year);
  if (f.businessType) parts.push(f.businessType);
  if (f.detailItems.length > 0) parts.push(f.detailItems.join("+"));
  if (f.ministry) parts.push(f.ministry);
  if (f.status) parts.push(f.status);
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  return `${parts.join("_")}_${stamp}.csv`.replace(/[/\\?%*:|"<>]/g, "");
}

/** 엑셀 한글 깨짐 방지를 위해 UTF-8 BOM을 붙여 내려받는다. */
export function downloadCsv(csv: string, fileName: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
