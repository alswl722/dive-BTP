"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, ClipboardList, Inbox, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAdminState } from "@/lib/admin-state";
import { useAuth, isAdmin } from "@/lib/auth";
import { useReviewStatus } from "@/lib/app-state";
import { dashboardReferenceDate, programApplicantIds, programKey } from "@/lib/program-progress";
import { daysUntil, formatDday, cn } from "@/lib/utils";
import type { Company, Program } from "@/types";

/**
 * 심사 진입 화면 — "내가 심사할 수 있는 지원사업"만 보여준다.
 *
 * 이전에는 담당자가 전체 기업을 바로 심사할 수 있어 관리자의 배정이 무의미했다.
 * 이제 배정받은 사업을 고른 뒤 그 사업의 신청 기업만 심사한다.
 * (전체 사업 정보 열람은 '지원 사업' 화면에서 계속 가능 — 열람과 심사 권한을 분리)
 *
 * 관리자는 전사 총괄이므로 배정과 무관하게 전 사업을 볼 수 있다.
 */
export function MyPrograms({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const { assigns } = useAdminState();
  const { user } = useAuth();
  const { statuses } = useReviewStatus();
  const admin = isAdmin(user);

  const rows = useMemo(() => {
    const withApplicants = programs.filter((p) => p.applicantCount > 0);
    const mine = admin
      ? withApplicants
      : withApplicants.filter((p) => assigns[programKey(p)] === user?.username);

    return mine
      .map((p) => {
        const ids = programApplicantIds(p, companies);
        const reviewed = ids.filter((id) => {
          const c = companies.find((x) => x.id === id);
          return c && (statuses[c.id] ?? c.reviewStatus) !== "후보";
        }).length;
        return { p, total: ids.length, reviewed, remaining: ids.length - reviewed };
      })
      .sort((a, b) => b.remaining - a.remaining || b.p.year - a.p.year);
  }, [programs, companies, assigns, statuses, admin, user]);

  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
  // 표본 데이터라 실제 오늘 날짜로는 전부 마감 — 대시보드와 같은 기준일(지원이력 최신연도)을 쓴다
  const referenceDate = useMemo(() => dashboardReferenceDate(programs), [programs]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-[20px] font-extrabold tracking-tight">기업 선정</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {admin ? (
            <>전사 관리자 권한으로 모든 지원사업을 심사할 수 있습니다.</>
          ) : (
            <>배정받은 지원사업입니다. 사업을 선택하면 해당 사업의 신청 기업을 심사할 수 있습니다.</>
          )}
          {rows.length > 0 && <> · 미검토 {totalRemaining}건</>}
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="space-y-2 p-8 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="text-[13px] font-medium">배정된 지원사업이 없습니다.</p>
          <p className="text-[12px] text-muted-foreground">
            관리자가 사업을 배정하면 여기에 표시됩니다.
            <br />
            전체 지원사업 정보는{" "}
            <Link href="/programs" className="text-primary hover:underline">
              지원 사업
            </Link>{" "}
            화면에서 확인할 수 있습니다.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map(({ p, total, reviewed, remaining }) => (
            <ProgramCard
              key={programKey(p)}
              program={p}
              total={total}
              reviewed={reviewed}
              remaining={remaining}
              referenceDate={referenceDate}
            />
          ))}
        </div>
      )}

      {admin && rows.length > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          관리자에게는 배정과 무관하게 전 사업이 표시됩니다. 담당자에게는 배정된 사업만 보입니다.
        </p>
      )}
    </div>
  );
}

function ProgramCard({
  program,
  total,
  reviewed,
  remaining,
  referenceDate,
}: {
  program: Program;
  total: number;
  reviewed: number;
  remaining: number;
  referenceDate: Date;
}) {
  const pct = total ? Math.round((reviewed / total) * 100) : 0;
  const dday = daysUntil(program.endDate, referenceDate);
  const done = remaining === 0;

  return (
    <Link href={`/companies?program=${programKey(program)}`}>
      <Card className="flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-modal">
        <div className="flex items-center gap-2">
          <Badge variant="info">{program.businessType ?? "기타"}</Badge>
          <span className="text-[11px] text-muted-foreground">{program.year}</span>
          {dday != null && dday >= 0 && (
            <span className={cn("ml-auto text-[10.5px] font-bold tabular-nums", dday <= 7 ? "text-bad" : "text-muted-foreground")}>
              {formatDday(dday)}
            </span>
          )}
        </div>

        <p className="text-[13.5px] font-bold leading-snug">{program.name ?? program.programCode}</p>

        <div className="mt-auto space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", done ? "bg-good" : "bg-info")} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-muted-foreground">
              신청 {total}개사 · 심사완료 {reviewed}
            </span>
            {done ? (
              <span className="font-medium text-good">완료</span>
            ) : (
              <span className="font-medium text-warn">미검토 {remaining}</span>
            )}
          </div>
        </div>

        <span className="flex items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-[12px] font-medium text-primary-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          심사하기
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Card>
    </Link>
  );
}
