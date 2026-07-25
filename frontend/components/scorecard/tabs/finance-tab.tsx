import { AxisSignals } from "@/components/scorecard/axis-signals";
import { FinanceScorecard } from "@/components/scorecard/finance-scorecard";
import { FinanceTrendChart } from "@/components/charts/finance-trend";
import { StatCard } from "@/components/ui/stat-card";
import { Selectable } from "@/lib/report-select";
import type { Company } from "@/types";
import { formatKRW } from "@/lib/utils";

export function FinanceTab({ company, latestYear }: { company: Company; latestYear: number }) {
  return (
    <div className="space-y-5">
      {/* 개요 탭에서 이동한 핵심 재무 지표 */}
      <Selectable id="fin-stats">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="최근 매출" value={formatKRW(company.revenueLatest)} />
          <StatCard label="누적 지원금" value={formatKRW(company.support.총지원금_천원)} sub={`${company.support.건수 ?? 0}건`} />
          <StatCard label="1인당 평균급여" value={formatKRW(company.avgSalaryLatest)} />
        </div>
      </Selectable>

      <AxisSignals company={company} latestYear={latestYear} axis="재무" />

      {/* 재무 추세 — 자산·매출액·영업이익 5개년. 영업이익은 규모가 달라 우축 분리 */}
      <Selectable id="fin-trend">
        <div className="rounded-lg border p-3.5">
          <p className="mb-2 text-[12.5px] font-bold">재무 추세</p>
          <FinanceTrendChart trends={company.trends} />
        </div>
      </Selectable>

      <FinanceScorecard company={company} />
    </div>
  );
}
