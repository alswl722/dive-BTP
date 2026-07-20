import { AlertTriangle, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { cn, formatKRW } from "@/lib/utils";
import { deptKey, findConcurrentPairs, summarizeConcurrent } from "@/lib/concurrent-support";
import type { Company } from "@/types";

const resultVariant = { 선정: "good", 탈락: "bad", 포기: "secondary" } as const;

export function SupportHistoryTab({ company }: { company: Company }) {
  const h = company.supportHistory;
  const concurrent = summarizeConcurrent(company);
  const pairs = findConcurrentPairs(company).filter((p) => p.crossDept && p.sameType);

  return (
    <div className="space-y-5">
      <ConcurrentPanel summary={concurrent} pairs={pairs} />

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
                <div className="flex min-w-0 items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">{r.date}</span>
                  <span className="truncate">{r.bizType}</span>
                  {deptKey(r.programCode) && (
                    <span
                      className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      title={`사업코드 ${r.programCode} — 접두사로 추정한 사업군`}
                    >
                      {deptKey(r.programCode)}
                    </span>
                  )}
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

/**
 * 동시 수혜 패널 — "지금 다른 부서에서 받고 있나".
 *
 * 반복 수혜(해마다 뽑히나)와 다른 문제다. 부서별로 따로 심사하는 구조상 담당자가
 * 못 보던 지점이라, 기간이 겹치는 건을 사업군·지원 성격까지 대조해 보여준다.
 */
function ConcurrentPanel({
  summary,
  pairs,
}: {
  summary: ReturnType<typeof summarizeConcurrent>;
  pairs: ReturnType<typeof findConcurrentPairs>;
}) {
  if (summary.total === 0 && summary.missingPeriod === 0) return null;

  return (
    <div className="space-y-2">
      {summary.total > 0 && (
        <div className="rounded-lg border p-3.5">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-[12.5px] font-bold">동시 수행 지원</p>
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            수행 기간이 겹치는 건 <b className="text-foreground">{summary.total}쌍</b>
            {summary.crossDept > 0 && <> · 그중 다른 사업군 <b className="text-foreground">{summary.crossDept}쌍</b></>}
            {summary.crossDeptSameType > 0 && <> · 같은 성격 <b className="text-bad">{summary.crossDeptSameType}쌍</b></>}
          </p>
          {summary.deptUnknown > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              ※ {summary.deptUnknown}쌍은 연도가 달라 사업군을 비교할 수 없습니다(2024년 사업코드 체계 개편).
            </p>
          )}
        </div>
      )}

      {pairs.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-bad-bg px-3.5 py-3 text-[12px] text-bad">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold">같은 성격의 지원을 다른 사업군에서 동시 수령</p>
            <ul className="mt-1 space-y-0.5 text-[11.5px] opacity-90">
              {pairs.slice(0, 4).map((p, i) => (
                <li key={i}>
                  {p.a.bizType} — [{deptKey(p.a.programCode)}] {p.a.programCode} + [{deptKey(p.b.programCode)}] {p.b.programCode}
                </li>
              ))}
              {pairs.length > 4 && <li>외 {pairs.length - 4}건</li>}
            </ul>
          </div>
        </div>
      )}

      {summary.missingPeriod > 0 && (
        <p className="text-[11px] text-muted-foreground">
          ※ 수행 기간이 없는 선정 건 {summary.missingPeriod}건은 판정에서 제외됐습니다(과소 판정 가능).
        </p>
      )}
    </div>
  );
}
