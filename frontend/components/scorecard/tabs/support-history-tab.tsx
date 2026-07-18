import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { cn, formatKRW } from "@/lib/utils";
import type { Company } from "@/types";

const resultVariant = { 선정: "good", 탈락: "bad", 포기: "secondary" } as const;

export function SupportHistoryTab({ company }: { company: Company }) {
  const h = company.supportHistory;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="총 지원건수" value={`${company.support.건수 ?? 0}건`} />
        <StatCard label="총 지원금" value={formatKRW(company.support.총지원금_천원)} />
        <StatCard label="지원 연도수" value={`${company.support.지원연도수 ?? 0}개년`} />
      </div>

      {h.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-muted-foreground">지원 이력이 없습니다.</p>
      ) : (
        <ol className="relative space-y-3 border-l pl-4">
          {h.map((r, i) => (
            <li key={i} className="relative">
              <span
                className={cn(
                  "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                  r.result === "선정" ? "bg-good" : r.result === "탈락" ? "bg-bad" : "bg-muted-foreground"
                )}
              />
              <div className="flex items-center justify-between gap-2 text-[12.5px]">
                <div>
                  <span className="tabular-nums text-muted-foreground">{r.date}</span>
                  <span className="ml-2">{r.bizType}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.amount > 0 && <span className="tabular-nums text-[11px] text-muted-foreground">{formatKRW(r.amount)}</span>}
                  <Badge variant={resultVariant[r.result]}>{r.result}</Badge>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
