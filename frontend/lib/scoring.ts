import { AXES, type Axis, type AxisScores } from "@/types";

// ⚠️ 종합점수는 재무축 담당자가 "축 어긋남을 뭉개지 않기 위해 의도적으로 만들지 않은" 값이다.
// 새 디자인(배지·정렬·필터·가중치조정)이 이를 요구해 프론트 전용으로 4축 가중평균을 계산한다 —
// 백엔드/데이터에는 반영하지 않음. 그 축 어긋남 신호 자체는 잃지 않도록 axisSpread/
// AXIS_MISALIGNMENT_THRESHOLD로 스코어카드에 별도 경고로 복원해뒀다(scorecard-header.tsx).
// 기본 가중치는 동일 배분(25%×4)이며, 정확한 가중치는 팀 논의 후 확정 예정(임시값).
export const DEFAULT_AXIS_WEIGHTS: Record<Axis, number> = {
  성장성: 25,
  수익성: 25,
  효율성: 25,
  안정성: 25,
};

/** 4축 가중평균(0~100). 결측 축은 나머지 축끼리 재정규화해서 계산(전부 결측이면 null). */
export function computeOverallScore(scores: AxisScores, weights: Record<Axis, number> = DEFAULT_AXIS_WEIGHTS): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const axis of AXES) {
    const v = scores[axis];
    const w = weights[axis];
    if (v == null || !w) continue;
    weightedSum += v * w;
    weightTotal += w;
  }
  if (weightTotal === 0) return null;
  return weightedSum / weightTotal;
}

export const AXIS_MISALIGNMENT_THRESHOLD = 30;

/** 축간 최대-최소 격차. 격차가 크면(고성장·저수익 등) 종합점수 하나로 뭉개 읽으면 안 된다는 신호. */
export function axisSpread(scores: AxisScores): number {
  const vals = AXES.map((a) => scores[a]).filter((v): v is number => v != null);
  return vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
}

/** 종합점수 배지 색 신호. README 점수 배지 컬러 규칙: 65+ 녹색 / 50~64 블루 / 35~49 회청 / 34↓ 레드. */
export function overallScoreTone(score: number | null): "good" | "info" | "slate" | "bad" {
  if (score == null) return "slate";
  if (score >= 65) return "good";
  if (score >= 50) return "info";
  if (score >= 35) return "slate";
  return "bad";
}
