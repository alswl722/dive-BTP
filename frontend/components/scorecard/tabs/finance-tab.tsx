import { TrendBar } from "@/components/charts/trend-bar";
import type { Company } from "@/types";

export function FinanceTab({ company }: { company: Company }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-[12.5px] font-bold">
          매출액 추세 <span className="font-normal text-muted-foreground">(5개년, 천원)</span>
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
            · <span className="inline-block h-2 w-2 rounded-full bg-[hsl(140_60%_40%)] align-middle" /> 지원받은 연도
          </span>
        </p>
        <TrendBar
          data={company.trends.매출액 ?? []}
          color="hsl(var(--axis-growth))"
          supports={company.supportHistory}
        />
      </div>
      <div>
        <p className="mb-1 text-[12.5px] font-bold">
          영업이익률 추세 <span className="font-normal text-muted-foreground">(5개년, %)</span>
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
            · <span className="inline-block h-2 w-2 rounded-full bg-[hsl(140_60%_40%)] align-middle" /> 지원받은 연도
          </span>
        </p>
        <TrendBar
          data={company.trends.영업이익률 ?? []}
          color="hsl(var(--axis-profit))"
          supports={company.supportHistory}
        />
      </div>
    </div>
  );
}
