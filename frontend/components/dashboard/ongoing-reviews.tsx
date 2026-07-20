"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Program } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminState } from "@/lib/admin-state";
import { useAuth, isAdmin } from "@/lib/auth";
import { programKey } from "@/lib/program-progress";
import { daysUntil, formatDday, cn } from "@/lib/utils";

export type OngoingRow = {
  program: Program;
  applicantCount: number;
  reviewedCount: number;
};

/**
 * 대시보드 "진행 중인 심사" — 내가 실제로 심사할 수 있는(배정받은) 사업만 띄운다.
 * 배정과 무관하게 전 사업을 보여주면 '이어서 심사하기'가 권한 없는 화면으로 이어진다.
 * 전체 사업 열람은 '지원 사업' 메뉴에서 계속 가능하다.
 *
 * 배정 상태는 sessionStorage(클라이언트)에 있어 서버 컴포넌트에서 못 거른다 —
 * 그래서 행 계산은 서버에서 하고 필터만 여기서 한다.
 */
export function OngoingReviews({ rows, referenceDate }: { rows: OngoingRow[]; referenceDate: string }) {
  const { assigns } = useAdminState();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const ref = useMemo(() => new Date(referenceDate + "T00:00:00"), [referenceDate]);

  const mine = useMemo(
    () => (admin ? rows : rows.filter((r) => assigns[programKey(r.program)] === user?.username)),
    [rows, assigns, admin, user]
  );

  if (mine.length === 0) {
    return (
      <Card className="space-y-1 p-6 text-center">
        <p className="text-[13px] text-muted-foreground">진행 중인 배정 사업이 없습니다.</p>
        <p className="text-[11.5px] text-muted-foreground">
          배정 현황은{" "}
          <Link href="/companies" className="text-primary hover:underline">
            기업 선정
          </Link>{" "}
          에서 확인할 수 있습니다.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {mine.map((row) => (
        <OngoingProgramCard key={programKey(row.program)} {...row} referenceDate={ref} />
      ))}
    </div>
  );
}

function DdayChip({ dday }: { dday: number }) {
  const tone = dday <= 7 ? "bg-bad-bg text-bad" : dday <= 30 ? "bg-info-bg text-info" : "bg-good-bg text-good";
  return (
    <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums", tone)}>
      {formatDday(dday)}
    </span>
  );
}

function OngoingProgramCard({
  program,
  referenceDate,
  applicantCount,
  reviewedCount,
}: OngoingRow & { referenceDate: Date }) {
  const dday = daysUntil(program.endDate, referenceDate) ?? 0;
  const reviewPct = applicantCount ? Math.round((reviewedCount / applicantCount) * 100) : 0;
  const selectedPct = applicantCount ? Math.round((program.selectedCount / applicantCount) * 100) : 0;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <DdayChip dday={dday} />
        <Badge variant="info">{program.businessType ?? "기타"}</Badge>
      </div>
      <p className="text-[13.5px] font-bold leading-snug">{program.name}</p>
      <p className="text-[11.5px] text-muted-foreground">
        {reviewedCount}/{applicantCount}개 심사완료 · 선정 {program.selectedCount}건 · 미검토 {applicantCount - reviewedCount}건
      </p>
      <div className="space-y-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-info" style={{ width: `${reviewPct}%` }} />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-good" style={{ width: `${selectedPct}%` }} />
        </div>
      </div>
      <Link
        href={`/companies?program=${programKey(program)}`}
        className="block rounded-md bg-primary py-1.5 text-center text-[12px] font-medium text-primary-foreground hover:opacity-90"
      >
        이어서 심사하기
      </Link>
    </Card>
  );
}
