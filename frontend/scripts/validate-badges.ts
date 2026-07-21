/**
 * 배지 검증 — 심사 요약 배지의 발화율·커버리지·임계 민감도를 측정.
 *
 * 배경: 배지 임계값은 큐레이션된 표본 11개에 맞춰졌다. 본선(~1,200개)에선 다르게 나온다 —
 *   너무 자주 뜨면(위험>20% / 주의>30%) 심사자가 무시, 안 뜨면(0%) 무의미.
 *   본선 당일 이 스크립트로 재측정해 임계값을 재조정한다.
 *
 * ⚠️ 판정 로직을 재구현하지 않는다. review-summary.ts의 실제 deriveReviewSignals()를
 *   그대로 돌려 집계한다 → 화면 배지와 100% 일치, drift 0, 새 배지 자동 반영.
 *
 * 실행 (frontend/ 에서):
 *   npx tsx scripts/validate-badges.ts                       # API(localhost:8000)
 *   npx tsx scripts/validate-badges.ts --api http://host:8000
 *   npx tsx scripts/validate-badges.ts --fixtures            # 커밋된 fixture(표본 11개, 스모크)
 *
 * 읽기 전용. API_BASE의 /companies를 GET할 뿐 아무것도 쓰지 않는다.
 */

import {
  deriveReviewSignals,
  type Severity,
  TURNOVER_HIGH,
  CHURN_HIGH,
  LIFELINE_CHRONIC_YEARS,
  LOW_PERCENTILE,
} from "@/lib/review-summary";
import { latestSupportYear } from "@/lib/duplicate-risk";
import { axisSpread, AXIS_MISALIGNMENT_THRESHOLD } from "@/lib/scoring";
import type { Company } from "@/types";

// --- 판정 임계값 (경고 기준. 배지 임계값 자체는 review-summary.ts가 소유) ---
const HIGH_SEV_NOISE = 20; // 위험 배지 발화율 이 % 초과 → 노이즈 경고
const WARN_SEV_NOISE = 30; // 주의 배지
const LOW_COVERAGE = 70; // 커버리지 이 % 미만 → 소수 대상 경고

// ---------------------------------------------------------------- args
function parseArgs() {
  const a = process.argv.slice(2);
  const out = { api: "http://localhost:8000", fixtures: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--api") out.api = a[++i];
    else if (a[i] === "--fixtures") out.fixtures = true;
  }
  return out;
}

async function loadCompanies(args: ReturnType<typeof parseArgs>): Promise<Company[]> {
  if (args.fixtures) {
    const mod = await import("@/lib/fixtures/companies.json");
    return (mod.default ?? mod) as unknown as Company[];
  }
  const res = await fetch(`${args.api}/companies`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${args.api}/companies → ${res.status}`);
  return (await res.json()) as Company[];
}

// ---------------------------------------------------------------- helpers
const pct = (n: number, d: number) => (d ? (100 * n) / d : NaN);
const fmt = (v: number) => (Number.isNaN(v) ? "  —" : `${v.toFixed(0).padStart(3)}%`);

/** 동적 제목(결측 N건, {축} 저점… 등)을 안정 키로 정규화 — 숫자 → N. */
const norm = (title: string) => title.replace(/\d+/g, "N");

const SEV_ORDER: Record<Severity, number> = { 위험: 0, 주의: 1, 정보: 2 };

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs();
  const companies = await loadCompanies(args);
  const N = companies.length;
  const latestYear = latestSupportYear(companies);

  console.log("=".repeat(64));
  console.log("배지 검증 — 실제 deriveReviewSignals 실행 (읽기 전용)");
  console.log("=".repeat(64));
  console.log(`  소스: ${args.fixtures ? "fixture(표본)" : args.api}  ·  기업 ${N}개  ·  최근연도 ${latestYear}`);
  if (args.fixtures) console.log("  ⚠️ 표본은 큐레이션돼 발화율이 과대. 본선은 --api로 실데이터.");

  // --- [A] 배지별 발화율 ---
  type Agg = { sev: Severity; axis: string; count: number };
  const agg = new Map<string, Agg>();
  for (const c of companies) {
    for (const s of deriveReviewSignals(c, latestYear)) {
      const key = norm(s.title);
      const a = agg.get(key) ?? { sev: s.sev, axis: s.axis, count: 0 };
      a.count++;
      agg.set(key, a);
    }
  }
  const rows = [...agg.entries()].sort(
    (a, b) => SEV_ORDER[a[1].sev] - SEV_ORDER[b[1].sev] || b[1].count - a[1].count,
  );

  console.log("\n" + "─".repeat(64));
  console.log("[A] 배지별 발화율 (심각도순)");
  console.log("─".repeat(64));
  const warns: string[] = [];
  for (const [title, a] of rows) {
    const rate = pct(a.count, N);
    let flag = "  ";
    if (a.sev === "위험" && rate > HIGH_SEV_NOISE) { flag = "⚠️"; warns.push(`위험 '${title}' ${rate.toFixed(0)}% (>${HIGH_SEV_NOISE}%) — 흔하면 무시됨`); }
    else if (a.sev === "주의" && rate > WARN_SEV_NOISE) { flag = "⚠️"; warns.push(`주의 '${title}' ${rate.toFixed(0)}% (>${WARN_SEV_NOISE}%) — 노란 배지 벽`); }
    console.log(`  ${flag} [${a.sev}] ${fmt(rate)}  ${a.count}/${N}  ${title}  (${a.axis})`);
  }

  // --- [B] 커버리지 (데이터 없으면 뜰 수 없는 배지) ---
  console.log("\n" + "─".repeat(64));
  console.log("[B] 데이터 커버리지 — 배지가 뜰 수 있는 모집단");
  console.log("─".repeat(64));
  const cov: [string, (c: Company) => boolean][] = [
    ["고용 데이터(고용관측연수≥1)", (c) => (c.passthrough.고용관측연수 ?? 0) >= 1],
    ["재무 데이터(재무관측연수≥1)", (c) => (c.passthrough.재무관측연수 ?? 0) >= 1],
    ["회전율 백분위 산출(포지션 바)", (c) => c.employment?.회전율백분위 != null],
    ["업종내 백분위(전체fallback 아님)", (c) => c.percentileBasis !== "전체fallback"],
  ];
  for (const [label, f] of cov) {
    const n = companies.filter(f).length;
    const rate = pct(n, N);
    const flag = rate < LOW_COVERAGE ? "⚠️" : "  ";
    if (rate < LOW_COVERAGE) warns.push(`커버리지 '${label}' ${rate.toFixed(0)}% (<${LOW_COVERAGE}%) — 배지가 소수만 대상`);
    console.log(`  ${flag} ${fmt(rate)}  ${n}/${N}  ${label}`);
  }

  // --- [C] 임계 민감도 (숫자 임계 배지) — 원본 지표를 직접 읽어 임계별 발화율 ---
  console.log("\n" + "─".repeat(64));
  console.log("[C] 임계 민감도 — 임계값을 바꾸면 발화율이 어떻게 변하나");
  console.log("─".repeat(64));
  // 현재 임계값(cur)은 review-summary.ts/scoring.ts의 실제 상수에서 가져온다 → stale 없음.
  // 상수를 고치면 여기 '현재 X'와 * 표시가 자동으로 따라온다.
  const num = (v: number | null | undefined) => (v == null ? null : v);
  const sens: { label: string; cur: number; base: number[]; f: (c: Company, t: number) => boolean }[] = [
    { label: "고용 이직률 ≥ T", cur: TURNOVER_HIGH, base: [0.4, 0.6, 0.7], f: (c, t) => (num(c.passthrough.이직률_최근) ?? -1) >= t },
    { label: "고용 회전율 ≥ T", cur: CHURN_HIGH, base: [0.6, 1.0, 1.5], f: (c, t) => (num(c.passthrough.고용회전율_최근) ?? -1) >= t },
    { label: "영업외 연명 ≥ T년", cur: LIFELINE_CHRONIC_YEARS, base: [1, 3], f: (c, t) => (num(c.passthrough.영업외의존_연수) ?? -1) >= t },
    { label: "안정성 점수 < T (하위)", cur: LOW_PERCENTILE, base: [20, 30], f: (c, t) => (num(c.scores.안정성) ?? 101) < t },
    { label: "축 격차 ≥ T", cur: AXIS_MISALIGNMENT_THRESHOLD, base: [25, 35], f: (c, t) => axisSpread(c.scores) >= t },
  ];
  for (const { label, cur, base, f } of sens) {
    const ts = [...new Set([...base, cur])].sort((a, b) => a - b); // 현재값을 항상 포함
    const parts = ts.map((t) => `${t === cur ? "*" : ""}${t}:${fmt(pct(companies.filter((c) => f(c, t)).length, N))}`);
    console.log(`  ${label.padEnd(22)} ${parts.join("  ")}   (현재 ${cur} = *)`);
  }

  // --- 요약 ---
  console.log("\n" + "─".repeat(64));
  console.log("요약");
  console.log("─".repeat(64));
  if (warns.length === 0) console.log("  ✓ 임계값 위반 없음");
  for (const w of warns) console.log(`  ⚠️ ${w}`);
  console.log(
    "\n  ℹ️ '재무 안정성 하위'는 백분위<25 기준이라 구조적으로 ~25%가 '위험'.\n" +
    "     임계 문제가 아니라 sev(위험) 정책 이슈 — 팀 논의 대상.\n",
  );
  process.exit(warns.length ? 1 : 0);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
