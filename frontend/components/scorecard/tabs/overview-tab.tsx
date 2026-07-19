import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { AxisRadar } from "@/components/charts/axis-radar";
import { BusinessFitCard } from "@/components/axis8/BusinessFitCard";
import { AXES, type Company } from "@/types";
import { formatKRW, cn } from "@/lib/utils";

const AXIS_BAR_COLOR: Record<(typeof AXES)[number], string> = {
  성장성: "bg-axis-growth",
  수익성: "bg-axis-profit",
  효율성: "bg-axis-efficiency",
  안정성: "bg-axis-stability",
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
          <div className="space-y-3">
            {AXES.map((axis) => {
              const v = company.scores[axis];
              return (
                <div key={axis} className="space-y-1">
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span>{axis}</span>
                    <span className="tabular-nums">
                      <span className="font-bold">{v == null ? "—" : Math.round(v)}</span>
                      {v != null && <span className="ml-1 text-[10.5px] text-muted-foreground">P{Math.round(v)}</span>}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", AXIS_BAR_COLOR[axis])}
                      style={{ width: `${v == null ? 0 : Math.max(2, Math.min(100, v))}%` }}
                    />
                  </div>
                </div>
              );
            })}
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
