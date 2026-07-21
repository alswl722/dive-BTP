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
import { programKey as makeProgramKey } from "@/lib/program-progress";
import { formatKRW } from "@/lib/utils";
import { type Company, type Program, type ReviewStatus } from "@/types";

// 결정된 상태만(후보 제외) 사업별로 묶는다.
const DECISION_STATUSES = ["선정", "보류", "제외"] as const;
type Decision = (typeof DECISION_STATUSES)[number];
const STATUS_VARIANT: Record<Decision, "good" | "warn" | "bad"> = {
  선정: "good",
  보류: "warn",
  제외: "bad",
};

/**
 * 심사 결과 목록 — 사업별로 선정/보류/제외를 그룹화한다.
 *
 * 상태가 (기업 × 사업) 단위라, 같은 기업이 사업마다 다른 결정을 가질 수 있다.
 * 사업 단위로 묶어 "이 사업에서 누가 선정/보류/제외됐나"를 한눈에 본다.
 */
export function SelectedList({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const { statuses } = useReviewStatus();
  const latestYear = useMemo(() => latestSupportYear(companies), [companies]);

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const programByKey = useMemo(
    () => new Map(programs.map((p) => [makeProgramKey(p), p])),
    [programs],
  );

  // statuses 맵(key = "companyId|programKey") → 사업별 상태 그룹.
  const perProgram = useMemo(() => {
    const map = new Map<string, Record<Decision, Company[]>>();
    for (const [key, status] of Object.entries(statuses)) {
      if (!(DECISION_STATUSES as readonly string[]).includes(status)) continue;
      const sep = key.indexOf("|");
      const cid = Number(key.slice(0, sep));
      const progKey = key.slice(sep + 1);
      const company = companyById.get(cid);
      if (!company) continue;
      if (!map.has(progKey)) map.set(progKey, { 선정: [], 보류: [], 제외: [] });
      map.get(progKey)![status as Decision].push(company);
    }
    for (const groups of map.values()) {
      for (const s of DECISION_STATUSES) {
        groups[s].sort((a, b) => (resolveOverallScore(b) ?? 0) - (resolveOverallScore(a) ?? 0));
      }
    }
    return map;
  }, [statuses, companyById]);

  // 결정이 있는 사업만, 연도·이름 순으로.
  const programKeys = useMemo(
    () =>
      [...perProgram.keys()].sort((a, b) => {
        const pa = programByKey.get(a);
        const pb = programByKey.get(b);
        return (pb?.year ?? 0) - (pa?.year ?? 0) || (pa?.name ?? a).localeCompare(pb?.name ?? b);
      }),
    [perProgram, programByKey],
  );

  const total = useMemo(() => {
    const t: Record<Decision, number> = { 선정: 0, 보류: 0, 제외: 0 };
    for (const groups of perProgram.values())
      for (const s of DECISION_STATUSES) t[s] += groups[s].length;
    return t;
  }, [perProgram]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[20px] font-extrabold tracking-tight">선정 목록</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          사업별 심사 결과입니다. 같은 기업도 사업마다 결정이 다를 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {DECISION_STATUSES.map((s) => (
          <div key={s} className="rounded-lg bg-subtle py-3 text-center">
            <p className="text-[11px] text-muted-foreground">{s}</p>
            <p className="mt-0.5 text-[20px] font-extrabold tabular-nums">{total[s]}</p>
          </div>
        ))}
      </div>

      {programKeys.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed px-3.5 py-8 text-[12.5px] text-muted-foreground">
          <Inbox className="h-4 w-4 shrink-0" />
          아직 심사 결정이 없습니다. 기업 선정 화면에서 사업을 고르고 선정/보류/제외를 지정하세요.
        </div>
      ) : (
        programKeys.map((progKey) => {
          const program = programByKey.get(progKey);
          const groups = perProgram.get(progKey)!;
          const count = groups.선정.length + groups.보류.length + groups.제외.length;
          return (
            <section key={progKey} className="space-y-2.5 rounded-xl border p-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[14px] font-bold">{program?.name ?? progKey}</h2>
                <span className="text-[11px] text-muted-foreground">
                  {program ? `${program.year}년 · ` : ""}결정 {count}개사
                </span>
              </div>

              {DECISION_STATUSES.map((status) =>
                groups[status].length === 0 ? null : (
                  <div key={status} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
                      <span className="text-[11.5px] text-muted-foreground">{groups[status].length}개</span>
                    </div>
                    <div className="divide-y rounded-lg border">
                      {groups[status].map((c) => (
                        <CompanyRow key={c.id} company={c} latestYear={latestYear} />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </section>
          );
        })
      )}
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
