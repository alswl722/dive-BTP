import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 천원 단위 금액 → "1.2억" / "3,400만원" 표기 */
export function formatKRW(thousandWon: number | null | undefined): string {
  if (thousandWon == null) return "-";
  const won = thousandWon * 1000;
  if (Math.abs(won) >= 1e8) return `${(won / 1e8).toFixed(1)}억`;
  if (Math.abs(won) >= 1e4) return `${Math.round(won / 1e4).toLocaleString()}만원`;
  return `${won.toLocaleString()}원`;
}

/** YYYY-MM-DD → 기준일(today) 대비 D-day 정수(음수면 이미 지남).
 *  today는 항상 명시적으로 넘길 것 — 기본값을 두면 실제 벽시계 시각(2026)이 표본 데이터(2022~2024)
 *  기준일과 어긋나 호출부가 실수로 생략했을 때 조용히 "전부 마감"으로 계산되는 함정이 된다. */
export function daysUntil(dateStr: string | null | undefined, today: Date): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - t0.getTime()) / 86400000);
}

/** D-day 정수 → "D-12" / "D-day" / "마감" 라벨 */
export function formatDday(days: number | null): string {
  if (days == null) return "-";
  if (days < 0) return "마감";
  if (days === 0) return "D-day";
  return `D-${days}`;
}
