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

/** 0~100 점수 → 신호 색 토큰 */
export function scoreTone(score: number | null | undefined): "good" | "warn" | "bad" | "muted" {
  if (score == null) return "muted";
  if (score >= 60) return "good";
  if (score >= 40) return "warn";
  return "bad";
}
