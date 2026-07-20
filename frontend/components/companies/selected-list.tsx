"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { useReviewStatus } from "@/lib/app-state";
import { resolveOverallScore } from "@/lib/scoring";
import { deriveReviewSignals } from "@/lib/review-summary";
import { latestSupportYear } from "@/lib/duplicate-risk";
import { formatKRW } from "@/lib/utils";
import { REVIEW_STATUSES, type Company, type ReviewStatus } from "@/types";

const STATUS_VARIANT: Record<ReviewStatus, "good" | "info" | "warn" | "bad"> = {
  선정: "good",
  후보: "info",
  보류: "warn",
  제외: "bad",
};

/**
 * 심사 상태별 목록 — 담당자가 지금까지 내린 판단을 한곳에서 확인한다.
 *
 * 기업 탐색기(/companies)가 "찾는" 화면이라면 여기는 "정리된 결과"를 보는 화면.
 * 각 기업의 미해결 위험 신호를 함께 보여줘, 선정한 기업에 남은 리스크를 놓치지 않게 한다.
 */
export function SelectedList({ companies }: { companies: Company[] }) {
  const { statuses } = useReviewStatus();
  const latestYear = useMemo(() => latestSupportYear(companies), [companies]);

  const grouped = useMemo(() => {
    const map: Record<ReviewStatus, Company[]> = { 선정: [], 후보: [], 보류: [], 제외: [] };
    for (const c of companies) {
      const s = statuses[c.id] ?? c.reviewStatus;
      if (map[s]) map[s].push(c);
    }
    // 각 그룹은 종합점수 높은 순
    for (const s of REVIEW_STATUSES) {
      map[s].sort((a, b) => (resolveOverallScore(b) ?? 0) - (resolveOverallScore(a) ?? 0));
    }
    return map;
  }, [companies, statuses]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[20px] font-extrabold tracking-tight">선정 목록</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          심사 상태별로 정리된 기업 목록입니다. 각 기업의 미해결 위험 신호를 함께 확인하세요.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {REVIEW_STATUSES.map((s) => (
          <div key={s} className="rounded-lg bg-subtle py-3 text-center">
            <p className="text-[11px] text-muted-foreground">{s}</p>
            <p className="mt-0.5 text-[20px] font-extrabold tabular-nums">{grouped[s].length}</p>
          </div>
        ))}
      </div>

      {REVIEW_STATUSES.map((status) => (
        <section key={status} className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
            <span className="text-[12px] text-muted-foreground">{grouped[status].length}개</span>
          </div>

          {grouped[status].length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed px-3.5 py-5 text-[12px] text-muted-foreground">
              <Inbox className="h-4 w-4 shrink-0" />
              아직 {status} 상태인 기업이 없습니다. 기업 상세에서 상태를 지정하세요.
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {grouped[status].map((c) => (
                <CompanyRow key={c.id} company={c} latestYear={latestYear} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function CompanyRow({ company, latestYear }: { company: Company; latestYear: number }) {
  const signals = deriveReviewSignals(company, latestYear);
  const risk = signals.filter((s) => s.sev === "위험").length;
  const warn = signals.filter((s) => s.sev === "주의").length;

  return (
    <Link
      href={`/companies/${company.id}`}
      className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/50"
    >
      <ScoreBadge score={resolveOverallScore(company)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold">{company.name}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">
          {company.industry ?? "업종 미상"}
          {company.tech?.domain.주력기술분야 && ` · ${company.tech.domain.주력기술분야}`}
          {company.support.건수 != null && ` · 수혜 ${company.support.건수}건`}
          {company.support.총지원금_천원 != null && ` · ${formatKRW(company.support.총지원금_천원)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {risk > 0 && <Badge variant="bad" className="text-[10.5px]">위험 {risk}</Badge>}
        {warn > 0 && <Badge variant="warn" className="text-[10.5px]">주의 {warn}</Badge>}
        {risk === 0 && warn === 0 && <Badge variant="good" className="text-[10.5px]">특이사항 없음</Badge>}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
