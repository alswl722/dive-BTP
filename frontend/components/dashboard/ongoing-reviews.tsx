"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Company, Program } from "@/types";
import type { ProgramStatus } from "@/lib/program-status";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth, isAdmin } from "@/lib/auth";
import { useReviewStatus } from "@/lib/app-state";
import { programKey, programApplicantIds } from "@/lib/program-progress";
import { statusKey } from "@/lib/status-key";
import { useAdminState } from "@/lib/admin-state";
import { resolveProgramStatus } from "@/lib/program-status";
import { daysUntil, formatDday } from "@/lib/utils";

export type OngoingRow = {
  program: Program;
  applicantCount: number;
};

/**
 * 대시보드 "진행 중인 심사" — 내가 실제로 심사할 수 있는(배정받은) 사업만 띄운다.
 * 배정과 무관하게 전 사업을 보여주면 '이어서 심사하기'가 권한 없는 화면으로 이어진다.
 * 전체 사업 열람은 '지원 사업' 메뉴에서 계속 가능하다.
 *
 * 배정 상태는 localStorage(클라이언트)에 있어 서버 컴포넌트에서 못 거른다 —
 * 그래서 행 계산은 서버에서 하고 필터만 여기서 한다.
 */
/** 한 화면에 띄우는 카드 수 — 3열×2행. 넘치면 '기업 선정'에서 전부 본다. */
const MAX_CARDS = 6;

export function OngoingReviews({
  rows,
  companies,
  referenceDate,
}: {
  rows: OngoingRow[];
  companies: Company[];
  referenceDate: string;
}) {
  const { assigns, statuses } = useAdminState();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const ref = useMemo(() => new Date(referenceDate + "T00:00:00"), [referenceDate]);

  const mine = useMemo(() => {
    const assigned = admin ? rows : rows.filter((r) => assigns[programKey(r.program)] === user?.username);
    // 진행중 → 예정 → 완료 순. 같은 상태면 서버가 넘겨준 마감 임박순을 유지한다.
    const rank = { 진행중: 0, 예정: 1, 완료: 2 } as const;
    return [...assigned].sort(
      (a, b) =>
        rank[resolveProgramStatus(a.program, ref, statuses)] - rank[resolveProgramStatus(b.program, ref, statuses)]
    );
  }, [rows, assigns, admin, user, ref, statuses]);

  const shown = mine.slice(0, MAX_CARDS);

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
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((row) => (
          <OngoingProgramCard
            key={programKey(row.program)}
            {...row}
            companies={companies}
            referenceDate={ref}
            status={resolveProgramStatus(row.program, ref, statuses)}
          />
        ))}
      </div>
      {/* 잘린 건수를 숨기면 "이게 전부"로 읽힌다 */}
      {mine.length > MAX_CARDS && (
        <Link href="/companies" className="block text-[11.5px] text-primary hover:underline">
          배정된 사업 {mine.length - MAX_CARDS}건 더 보기
        </Link>
      )}
    </div>
  );
}

function DdayChip({ dday }: { dday: number }) {
  const urgent = dday <= 7;
  return (
    <span
      className={
        urgent
          ? "shrink-0 rounded-md bg-bad-bg px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-bad"
          : "shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-muted-foreground"
      }
    >
      {formatDday(dday)}
    </span>
  );
}

function OngoingProgramCard({
  program,
  companies,
  referenceDate,
  applicantCount,
  status,
}: OngoingRow & { companies: Company[]; referenceDate: Date; status: ProgramStatus }) {
  const { statuses } = useReviewStatus();
  const dday = daysUntil(program.endDate, referenceDate) ?? 0;

  // 선정/제외/미검토는 사업 단위 리뷰 상태(company × programKey)로 센다 —
  // program.selectedCount(과거 실제 선정 기록)를 쓰면 지금 담당자가 이 화면에서
  // 선정 처리해도 숫자가 안 바뀌어 실제 심사 진행과 어긋난다.
  const { selectedCount, excludedCount, reviewedCount } = useMemo(() => {
    const progKey = programKey(program);
    let selected = 0;
    let excluded = 0;
    let reviewed = 0;
    for (const cid of programApplicantIds(program, companies)) {
      const s = statuses[statusKey(cid, progKey)] ?? "후보";
      if (s !== "후보") reviewed++;
      if (s === "선정") selected++;
      if (s === "제외") excluded++;
    }
    return { selectedCount: selected, excludedCount: excluded, reviewedCount: reviewed };
  }, [program, companies, statuses]);

  const reviewPct = applicantCount ? Math.round((reviewedCount / applicantCount) * 100) : 0;
  const unreviewed = applicantCount - reviewedCount;

  return (
    <Card className="space-y-2.5 p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 완료된 사업에 D-day를 띄우면 아직 기한이 남은 것처럼 읽힌다 */}
        {status === "완료" ? (
          <Badge variant="secondary">완료</Badge>
        ) : (
          <DdayChip dday={dday} />
        )}
        <Badge variant="secondary">{program.businessType ?? "기타"}</Badge>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold leading-snug">{program.name}</p>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          진행률 {reviewPct}%
        </Badge>
      </div>

      <p className="text-[11px] tabular-nums text-muted-foreground">
        <span className="font-bold text-good">{selectedCount}</span> 선정
        <span className="mx-1 text-muted-foreground/40">·</span>
        <span className="font-bold text-bad">{excludedCount}</span> 제외
        <span className="mx-1 text-muted-foreground/40">·</span>
        <span className="font-bold text-warn">{unreviewed}</span> 미검토
      </p>

      <Link
        href={`/companies?program=${programKey(program)}`}
        className="block rounded-md bg-primary py-1.5 text-center text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
      >
        이어서 심사하기
      </Link>
    </Card>
  );
}
