import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { AxisRadar } from "@/components/charts/axis-radar";
import { BusinessFitCard } from "@/components/axis8/BusinessFitCard";
import { AXES, type Company } from "@/types";
import { formatKRW, cn } from "@/lib/utils";

// 톤온톤(프라이머리 블루 계열) — 축 구분은 아래 라벨이 하므로 색은 채도 대신 명도 단계로만.
const AXIS_BAR_COLOR: Record<(typeof AXES)[number], string> = {
  성장성: "bg-primary",
  수익성: "bg-primary/75",
  효율성: "bg-primary/55",
  안정성: "bg-primary/35",
};

export function OverviewTab({ company }: { company: Company }) {
  const lastSelectedYear = company.supportHistory.filter((h) => h.result === "선정").map((h) => h.date.slice(0, 4)).sort().at(-1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="최근 매출" value={formatKRW(company.revenueLatest)} />
        <StatCard label="누적 지원금" value={formatKRW(company.support.총지원금_천원)} sub={`${company.support.건수 ?? 0}건`} />
        <StatCard label="1인당 평균급여" value={formatKRW(company.avgSalaryLatest)} />
        <StatCard label="마지막 선정연도" value={lastSelectedYear ?? "-"} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2.5 text-[12.5px] font-bold">4축 점수 <span className="font-normal text-muted-foreground">(업종 내 백분위)</span></p>
          {/* 세로 막대 + 중앙값 50 기준선 — 높이 대비로 축 어긋남(예: 효율 91 vs 안정 13)이 즉각 보이게.
              위 20px(top-5)는 점수 라벨 여백 — 막대 높이(%)와 50 점선이 같은 스케일을 공유해야 하므로
              라벨은 막대 위 절대배치로 뺀다. */}
          <div className="relative h-[168px] max-w-[300px]">
            <div className="absolute inset-x-0 bottom-0 top-5 border-b border-muted-foreground/30">
              <div className="pointer-events-none absolute inset-x-0 bottom-1/2 border-t border-dashed border-muted-foreground/40" />
              <div className="absolute inset-0 flex items-end gap-3 px-1">
                {AXES.map((axis) => {
                  const v = company.scores[axis];
                  const h = v == null ? 2 : Math.max(2, Math.min(100, v));
                  return (
                    <div key={axis} className="flex h-full flex-1 items-end justify-center">
                      <div
                        className={cn("relative w-[70%] max-w-[44px] rounded-t-[5px]", v == null ? "bg-muted" : AXIS_BAR_COLOR[axis])}
                        style={{ height: `${h}%` }}
                      >
                        <span className="absolute -top-[18px] left-1/2 -translate-x-1/2 text-[12px] font-bold tabular-nums">
                          {v == null ? "—" : Math.round(v)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex max-w-[300px] gap-3 px-1 pt-1.5">
            {AXES.map((axis) => (
              <span key={axis} className="flex-1 text-center text-[11px] text-muted-foreground">{axis}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2.5 text-[12.5px] font-bold">업종 평균 대비</p>
          <AxisRadar scores={company.scores} />
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-[12.5px] font-bold">보유 인증</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(company.certifications).map(([k, has]) => (
            <Badge key={k} variant={has ? "good" : "secondary"} className={!has ? "opacity-50" : undefined}>
              {k}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="특허(등록/출원)" value={`${company.patents.등록 ?? 0} / ${company.patents.출원 ?? 0}`} />
        <StatCard label="NTIS(주관/위탁)" value={`${company.ntis.주관 ?? 0} / ${company.ntis.위탁 ?? 0}`} />
        <StatCard label="지원 이력" value={`${company.support.건수 ?? 0}건`} sub={`${company.support.지원연도수 ?? 0}개년`} />
      </div>

      <BusinessFitCard
        fit={company.businessFit}
        compact
        hasSupportHistory={(company.supportHistory ?? []).length > 0}
      />
    </div>
  );
}
