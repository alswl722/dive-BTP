import { TrendBar } from "@/components/charts/trend-bar";
import type { Company } from "@/types";

export function FinanceTab({ company }: { company: Company }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-[12.5px] font-bold">매출액 추세 <span className="font-normal text-muted-foreground">(5개년, 천원)</span></p>
        <TrendBar data={company.trends.매출액 ?? []} color="hsl(var(--axis-growth))" />
      </div>
      <div>
        <p className="mb-1 text-[12.5px] font-bold">영업이익률 추세 <span className="font-normal text-muted-foreground">(5개년, %)</span></p>
        <TrendBar data={company.trends.영업이익률 ?? []} color="hsl(var(--axis-profit))" />
      </div>
    </div>
  );
}
