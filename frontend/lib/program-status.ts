import type { Program } from "@/types";

export type ProgramStatus = "예정" | "진행중" | "완료";

// 원본 시트 표기 → 디자인이 기대하는 라벨(순수 표기 보정, 값 자체는 그대로 필터에 사용)
const BUSINESS_TYPE_LABELS: Record<string, string> = { RnD: "R&D" };

export function businessTypeLabel(bt: string | null): string {
  if (!bt) return "미분류";
  return BUSINESS_TYPE_LABELS[bt] ?? bt;
}

/** ref(기준일) 대비 사업 상태. 날짜 정보가 없으면 신청이력 유무로 대략 판정. */
export function programStatus(p: Program, ref: Date): ProgramStatus {
  if (!p.startDate || !p.endDate) return p.applicantCount > 0 ? "완료" : "예정";
  const t = ref.getTime();
  const start = new Date(p.startDate + "T00:00:00").getTime();
  const end = new Date(p.endDate + "T00:00:00").getTime();
  if (t < start) return "예정";
  if (t > end) return "완료";
  return "진행중";
}

export const PROGRAM_STATUS_LIST: ProgramStatus[] = ["예정", "진행중", "완료"];

/**
 * 관리자 지정 상태가 있으면 그것을, 없으면 날짜 기준 자동 판정을 쓴다.
 * (키를 직접 조합하는 이유는 program-progress ↔ program-status 순환 import 회피)
 */
export function resolveProgramStatus(
  p: Program,
  ref: Date,
  overrides?: Record<string, ProgramStatus>
): ProgramStatus {
  return overrides?.[`${p.year}:${p.programCode}`] ?? programStatus(p, ref);
}

export const PROGRAM_STATUS_BADGE: Record<ProgramStatus, "info" | "warn" | "good"> = {
  진행중: "info",
  예정: "warn",
  완료: "good",
};
