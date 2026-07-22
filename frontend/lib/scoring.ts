import { AXES, type Axis, type AxisScores, type Company, type CompositeAxis, type CompositeGroup } from "@/types";

// ⚠️ 재무 4축만의 가중평균. 종합점수(7축+최저축 캡)는 백엔드 composite_score.py가
// 서버에서 계산해 Company.compositeScore로 내려준다(docs/종합점수_설계노트.md).
// 이 함수는 "축 가중치 조정" UI가 재무 세부축만 커스텀할 때 재계산용으로 쓰인다 —
// resolveOverallScore()가 그룹 가중치와 합쳐 최종 종합점수를 만든다.
// 기본 가중치는 백엔드 composite_score_weights.yaml의 재무 그룹 내부 비율과 동일하게 맞춤
// (성장성·수익성·안정성 9.72%, 효율성 4.17% — 지표 1개뿐인 효율성만 하한 조정).
export const DEFAULT_AXIS_WEIGHTS: Record<Axis, number> = {
  성장성: 29.16,
  수익성: 29.16,
  효율성: 12.51,
  안정성: 29.16,
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

// 종합점수 그룹(재무/기술/정합성) 가중치 — 백엔드 composite_score_weights.yaml groups와 동일 기본값.
export const DEFAULT_GROUP_WEIGHTS: Record<CompositeGroup, number> = {
  finance: 33.33,
  tech: 33.33,
  alignment: 33.34,
};

// 기술 그룹 세부축(R&D특허 / NTIS). 백엔드는 그룹 내 균등(각 1/6)이라 기본 50/50.
export const TECH_AXES = ["R&D특허", "NTIS"] as const;
export type TechAxis = (typeof TECH_AXES)[number];
export const DEFAULT_TECH_WEIGHTS: Record<TechAxis, number> = { "R&D특허": 50, NTIS: 50 };

const GROUP_AXES: Record<CompositeGroup, CompositeAxis[]> = {
  finance: ["성장성", "수익성", "효율성", "안정성"],
  tech: ["R&D특허", "NTIS"],
  alignment: ["정합성"],
};

const CAP_MARGIN = 15;

/** null을 건너뛰는 가중평균. 전부 null이거나 가중치 합이 0이면 null. */
function weightedMean(pairs: [number | null | undefined, number][]): number | null {
  let sum = 0;
  let total = 0;
  for (const [v, w] of pairs) {
    if (v == null || !w) continue;
    sum += v * w;
    total += w;
  }
  return total === 0 ? null : sum / total;
}

/**
 * 기술 그룹 점수 = R&D특허·NTIS 가중평균(0~100). 기업 목록의 '기술 점수' 컬럼값.
 * R&D특허 한 축만 보면 정부 R&D 수주(NTIS)가 정반대인 기업이 뒤집혀 보이므로
 * 두 축을 합쳐 기술력을 한 값으로 요약한다(종합점수의 기술 그룹 기여분과 동일 개념).
 */
export function techGroupScore(company: Company, techWeights: Record<TechAxis, number> = DEFAULT_TECH_WEIGHTS): number | null {
  const bd = company.compositeScore?.breakdown;
  const rp = bd ? bd["R&D특허"] : company.tech?.scores.rndPatent ?? null;
  const nt = bd ? bd["NTIS"] : company.tech?.scores.ntis ?? null;
  return weightedMean([
    [rp, techWeights["R&D특허"]],
    [nt, techWeights.NTIS],
  ]);
}

/**
 * 종합점수 재계산(그룹 가중치 커스텀 시). 재무 세부축은 financeAxisWeights(0~100 비율)를
 * 그룹 내부 배분으로 쓰고, 기술 2축은 균등 고정(현재 조정 UI 없음). 최저축 캡은 사용자가
 * 가중치를 바꿔도 항상 적용 — 축 어긋남을 가중치 조작으로 가릴 수 없게 하는 안전장치
 * (docs/종합점수_설계노트.md §2).
 */
export function computeCompositeScore(
  breakdown: Record<CompositeAxis, number | null>,
  groupWeights: Record<CompositeGroup, number> = DEFAULT_GROUP_WEIGHTS,
  financeAxisWeights: Record<Axis, number> = DEFAULT_AXIS_WEIGHTS,
  techAxisWeights: Record<TechAxis, number> = DEFAULT_TECH_WEIGHTS
): { score: number | null; rawWeightedAverage: number | null; lowestAxis: CompositeAxis | null; lowestAxisScore: number | null } {
  const axisWeights: Partial<Record<CompositeAxis, number>> = {};
  for (const group of Object.keys(GROUP_AXES) as CompositeGroup[]) {
    const gw = groupWeights[group] ?? 0;
    const axes = GROUP_AXES[group];
    if (group === "finance") {
      const financeTotal = AXES.reduce((s, a) => s + (financeAxisWeights[a] ?? 0), 0) || 1;
      for (const a of AXES) axisWeights[a] = (gw * (financeAxisWeights[a] ?? 0)) / financeTotal;
    } else if (group === "tech") {
      const techTotal = TECH_AXES.reduce((s, a) => s + (techAxisWeights[a] ?? 0), 0) || 1;
      for (const a of TECH_AXES) axisWeights[a] = (gw * (techAxisWeights[a] ?? 0)) / techTotal;
    } else {
      for (const a of axes) axisWeights[a] = gw / axes.length;
    }
  }

  let weightedSum = 0;
  let weightTotal = 0;
  let lowestAxis: CompositeAxis | null = null;
  let lowestScore = Infinity;
  for (const axis of Object.keys(axisWeights) as CompositeAxis[]) {
    const v = breakdown[axis];
    const w = axisWeights[axis] ?? 0;
    if (v == null || !w) continue;
    weightedSum += v * w;
    weightTotal += w;
    if (v < lowestScore) {
      lowestScore = v;
      lowestAxis = axis;
    }
  }

  if (weightTotal === 0 || lowestAxis == null) {
    return { score: null, rawWeightedAverage: null, lowestAxis: null, lowestAxisScore: null };
  }

  const rawWeightedAverage = weightedSum / weightTotal;
  const score = Math.min(rawWeightedAverage, lowestScore + CAP_MARGIN);
  return { score, rawWeightedAverage, lowestAxis, lowestAxisScore: lowestScore };
}

/** 가중치가 기본값과 다르면(커스텀) 프론트에서 재계산, 아니면 서버 compositeScore를 그대로 사용. */
export function resolveOverallScore(
  company: Company,
  groupWeights: Record<CompositeGroup, number> = DEFAULT_GROUP_WEIGHTS,
  financeAxisWeights: Record<Axis, number> = DEFAULT_AXIS_WEIGHTS,
  techAxisWeights: Record<TechAxis, number> = DEFAULT_TECH_WEIGHTS
): number | null {
  const isCustom = isCustomWeights(groupWeights, financeAxisWeights, techAxisWeights);
  if (!isCustom) return company.compositeScore?.score ?? null;
  if (!company.compositeScore) return null;
  return computeCompositeScore(company.compositeScore.breakdown, groupWeights, financeAxisWeights, techAxisWeights).score;
}

export function isCustomWeights(
  groupWeights: Record<CompositeGroup, number>,
  financeAxisWeights: Record<Axis, number>,
  techAxisWeights: Record<TechAxis, number> = DEFAULT_TECH_WEIGHTS
): boolean {
  const groupChanged = (Object.keys(DEFAULT_GROUP_WEIGHTS) as CompositeGroup[]).some(
    (g) => Math.abs(groupWeights[g] - DEFAULT_GROUP_WEIGHTS[g]) > 0.5
  );
  const axisChanged = AXES.some((a) => Math.abs(financeAxisWeights[a] - DEFAULT_AXIS_WEIGHTS[a]) > 0.5);
  const techChanged = TECH_AXES.some((a) => Math.abs(techAxisWeights[a] - DEFAULT_TECH_WEIGHTS[a]) > 0.5);
  return groupChanged || axisChanged || techChanged;
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

/** 축/지표 점수 → 등급 라벨·톤. 임계값(75/50/25)은 스코어카드·비교 화면에서 동일하게 쓴다. */
export function scoreBand(score: number | null | undefined): { label: string; tone: "good" | "warn" | "bad" | "muted" } {
  if (score == null || !Number.isFinite(score)) return { label: "정보없음", tone: "muted" };
  if (score >= 75) return { label: "상위", tone: "good" };
  if (score >= 50) return { label: "중상위", tone: "good" };
  if (score >= 25) return { label: "중하위", tone: "warn" };
  return { label: "하위", tone: "bad" };
}

export const SCORE_BAND_BADGE: Record<ReturnType<typeof scoreBand>["tone"], "good" | "warn" | "bad" | "secondary"> = {
  good: "good",
  warn: "warn",
  bad: "bad",
  muted: "secondary",
};
