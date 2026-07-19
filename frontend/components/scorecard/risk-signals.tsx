import type { ReactNode } from "react";
import { AXES, type Company } from "@/types";

type Sev = "위험" | "주의" | "정보";
interface Signal { sev: Sev; text: ReactNode; }

// 데이터에서 심사 유의 신호를 도출. 심각도는 상대 백분위 점수 기반(절대 임계값 아님),
// 수치는 raw 값을 맥락으로 함께 표기.
function deriveSignals(c: Company): Signal[] {
  const out: Signal[] = [];
  const stab = c.scores.안정성;
  const debt = c.rawMetrics["부채비율_최근"];
  const yrs = c.rawMetrics["흑자지속성"];
  const vals = AXES.map((a) => c.scores[a]).filter((v): v is number => v != null);
  const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;

  if (c.passthrough.자본잠식_플래그 === 1) {
    out.push({ sev: "위험", text: <><b>자본잠식</b> — 자본총계가 0 이하. 최우선 위험 신호.</> });
  }
  if (stab != null && stab < 25 && debt != null) {
    out.push({ sev: "위험", text: <><b>부채비율 {debt.toFixed(1)}배</b> — 자기자본 대비 부채 과다. 안정성 {Math.round(stab)}(업종 하위).</> });
  }
  if (spread >= 30) {
    const hi = AXES.reduce((a, b) => ((c.scores[b] ?? 0) > (c.scores[a] ?? 0) ? b : a));
    const lo = AXES.reduce((a, b) => ((c.scores[b] ?? 100) < (c.scores[a] ?? 100) ? b : a));
    out.push({ sev: "주의", text: <><b>축 어긋남</b> — {hi} {Math.round(c.scores[hi] ?? 0)} vs {lo} {Math.round(c.scores[lo] ?? 0)}. 한 축만 보면 오판.</> });
  }
  if (yrs != null && yrs <= 1) {
    out.push({ sev: "주의", text: <><b>흑자지속성 {yrs}/5</b> — 최근 5년 중 영업흑자 {yrs}년. 수익 안정성 낮음.</> });
  }
  if (!c.dataQuality.ok) {
    out.push({ sev: "정보", text: <>재무지표 결측 {c.dataQuality.missing.length}건 — 일부 점수가 부분 데이터 기반.</> });
  }
  return out;
}

const sevStyle: Record<Sev, { chip: string; bg: string }> = {
  위험: { chip: "bg-bad text-white", bg: "bg-bad/10" },
  주의: { chip: "bg-warn text-white", bg: "bg-warn/10" },
  정보: { chip: "bg-muted text-muted-foreground", bg: "bg-muted/40" },
};

export function RiskSignals({ company }: { company: Company }) {
  const signals = deriveSignals(company);
  return (
    <div>
      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">심사 유의 신호</h3>
      {signals.length === 0 ? (
        <p className="rounded-lg bg-good/10 px-4 py-3 text-sm text-good">특이 위험 신호 없음 — 재무 프로파일 안정적.</p>
      ) : (
        <div className="space-y-2">
          {signals.map((s, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-lg px-3.5 py-2.5 ${sevStyle[s.sev].bg}`}>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${sevStyle[s.sev].chip}`}>{s.sev}</span>
              <span className="text-sm leading-relaxed text-foreground">{s.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
