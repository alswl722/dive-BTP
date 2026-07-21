"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { useReviewStatus } from "@/lib/app-state";
import { useAdminState } from "@/lib/admin-state";
import { useAuth, isAdmin } from "@/lib/auth";
import { resolveOverallScore } from "@/lib/scoring";
import { deriveReviewSignals } from "@/lib/review-summary";
import { latestSupportYear } from "@/lib/duplicate-risk";
import { programKey as makeProgramKey, programApplicantIds, dashboardReferenceDate } from "@/lib/program-progress";
import { resolveProgramStatus, PROGRAM_STATUS_BADGE, type ProgramStatus } from "@/lib/program-status";
import { statusKey } from "@/lib/status-key";
import { formatKRW, cn } from "@/lib/utils";
import { type Company, type Program, type ReviewStatus } from "@/types";

const DECISION_STATUSES = ["선정", "제외"] as const;
type Decision = (typeof DECISION_STATUSES)[number];
const STATUS_VARIANT: Record<Decision, "good" | "bad"> = {
  선정: "good",
  제외: "bad",
};
const PROGRAM_STATUS_RANK: Record<ProgramStatus, number> = { 진행중: 0, 예정: 1, 완료: 2 };

/**
 * 선정 목록 — 담당자가 맡은 사업들을 카드로 나열하고, 사업마다 후보/선정/제외 현황을
 * 한눈에 본다. 담당자는 보통 여러 사업을 동시에 맡아 "이 사업은 아직 후보가 몇 명
 * 남았는지"를 사업 단위로 훑어보는 게 우선 과제라, 기업 상세 리스트보다 사업별 요약을
 * 먼저 보여주고 카드를 펼쳐야 결정된(선정/제외) 기업 명단이 나오게 한다.
 *
 * 배정 필터는 dashboard의 ongoing-reviews.tsx와 동일한 규칙 — 관리자는 전체,
 * 담당자는 assigns[programKey] === username인 사업만 본다.
 */
export function SelectedList({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const { statuses } = useReviewStatus();
  const { assigns, statuses: adminStatuses } = useAdminState();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const latestYear = useMemo(() => latestSupportYear(companies), [companies]);
  const referenceDate = useMemo(() => dashboardReferenceDate(programs), [programs]);

  const [openKey, setOpenKey] = useState<string | null>(null);

  // 신청 기록이 있고(=심사 대상이 존재) 내가 배정받은(관리자는 전체) 사업만.
  const myPrograms = useMemo(
    () =>
      programs.filter(
        (p) => p.applicantCount > 0 && (admin || assigns[makeProgramKey(p)] === user?.username)
      ),
    [programs, assigns, admin, user]
  );

  const rows = useMemo(() => {
    return myPrograms
      .map((program) => {
        const progKey = makeProgramKey(program);
        const counts: Record<ReviewStatus, number> = { 후보: 0, 선정: 0, 제외: 0 };
        const decided: Record<Decision, Company[]> = { 선정: [], 제외: [] };
        for (const cid of programApplicantIds(program, companies)) {
          const status = statuses[statusKey(cid, progKey)] ?? "후보";
          counts[status]++;
          if (status === "선정" || status === "제외") {
            const company = companies.find((c) => c.id === cid);
            if (company) decided[status].push(company);
          }
        }
        for (const s of DECISION_STATUSES) {
          decided[s].sort((a, b) => (resolveOverallScore(b) ?? 0) - (resolveOverallScore(a) ?? 0));
        }
        return {
          program,
          progKey,
          counts,
          decided,
          status: resolveProgramStatus(program, referenceDate, adminStatuses),
        };
      })
      .sort((a, b) => {
        const rankDiff = PROGRAM_STATUS_RANK[a.status] - PROGRAM_STATUS_RANK[b.status];
        if (rankDiff !== 0) return rankDiff;
        return (
          b.program.year - a.program.year ||
          (a.program.name ?? a.progKey).localeCompare(b.program.name ?? b.progKey)
        );
      });
  }, [myPrograms, companies, statuses, referenceDate, adminStatuses]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-extrabold tracking-tight">선정 목록</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {admin ? "전체 사업" : "내가 맡은 사업"}의 후보/선정/제외 현황입니다. 사업을 펼치면 결정된 기업 명단을 볼 수 있습니다.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed px-3.5 py-8 text-[12.5px] text-muted-foreground">
          <Inbox className="h-4 w-4 shrink-0" />
          {admin ? "신청 기록이 있는 사업이 없습니다." : "아직 배정받은 사업이 없습니다. 관리자에게 배정을 요청하세요."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map(({ program, progKey, counts, decided, status }) => {
            const open = openKey === progKey;
            const decidedCount = decided.선정.length + decided.제외.length;
            return (
              <section key={progKey} className="rounded-xl border">
                <button
                  onClick={() => setOpenKey(open ? null : progKey)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h2 className="truncate text-[14px] font-bold">{program.name ?? program.programCode}</h2>
                      <Badge variant={PROGRAM_STATUS_BADGE[status]} className="shrink-0">{status}</Badge>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{program.year}년</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-[12px]">
                    <CountPill label="후보" value={counts.후보} tone="text-info" />
                    <CountPill label="선정" value={counts.선정} tone="text-good" />
                    <CountPill label="제외" value={counts.제외} tone="text-bad" />
                  </div>
                </button>

                {open && (
                  <div className="space-y-2.5 border-t p-4 pt-3.5">
                    {decidedCount === 0 ? (
                      <p className="text-[12px] text-muted-foreground">
                        아직 결정된 기업이 없습니다. 기업 선정 화면에서 선정/제외를 지정하세요.
                      </p>
                    ) : (
                      DECISION_STATUSES.map((s) =>
                        decided[s].length === 0 ? null : (
                          <div key={s} className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Badge variant={STATUS_VARIANT[s]}>{s}</Badge>
                              <span className="text-[11.5px] text-muted-foreground">{decided[s].length}개</span>
                            </div>
                            <div className="divide-y rounded-lg border">
                              {decided[s].map((c) => (
                                <CompanyRow key={c.id} company={c} latestYear={latestYear} />
                              ))}
                            </div>
                          </div>
                        )
                      )
                    )}
                    <Link
                      href={`/companies?program=${progKey}`}
                      className="inline-block text-[11.5px] text-primary hover:underline"
                    >
                      이 사업 심사하러 가기
                    </Link>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CountPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={cn("font-bold tabular-nums", tone)}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
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
