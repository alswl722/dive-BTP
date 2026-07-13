import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DonutDist } from "@/components/charts/donut-dist";
import { cn, formatKRW } from "@/lib/utils";
import type { Company, SupportRecord } from "@/types";

const resultVariant = { 선정: "good", 탈락: "bad", 포기: "secondary" } as const;

function bizTypeDist(history: SupportRecord[]) {
  const m = new Map<string, number>();
  history.filter((h) => h.result === "선정").forEach((h) => m.set(h.bizType, (m.get(h.bizType) ?? 0) + 1));
  return [...m.entries()].map(([name, value]) => ({ name, value }));
}

export function SupportTimeline({ company }: { company: Company }) {
  const h = company.supportHistory;
  const total = h.length;
  const selected = h.filter((r) => r.result === "선정").length;
  const rate = total ? Math.round((selected / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>
          지원 이력 <span className="font-normal">· 선정률 {rate}% ({selected}/{total})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-[1fr_200px]">
        <ol className="relative space-y-3 border-l pl-4">
          {h.map((r, i) => (
            <li key={i} className="relative">
              <span className={cn(
                "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                r.result === "선정" ? "bg-good" : r.result === "탈락" ? "bg-bad" : "bg-muted-foreground"
              )} />
              <div className="flex items-center justify-between gap-2 text-sm">
                <div>
                  <span className="tabular-nums text-muted-foreground">{r.date}</span>
                  <span className="ml-2">{r.bizType}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.amount > 0 && <span className="tabular-nums text-xs text-muted-foreground">{formatKRW(r.amount)}</span>}
                  <Badge variant={resultVariant[r.result]}>{r.result}</Badge>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">선정 사업유형 분포</p>
          <DonutDist data={bizTypeDist(h)} />
        </div>
      </CardContent>
    </Card>
  );
}
