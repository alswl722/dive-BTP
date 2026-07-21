"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, KeyRound, Lock, LockOpen, Search, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { useAdminState } from "@/lib/admin-state";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/lib/auth";
import { computeOverallScore } from "@/lib/scoring";
import { dashboardReferenceDate, programKey } from "@/lib/program-progress";
import { resolveProgramStatus, PROGRAM_STATUS_BADGE, PROGRAM_STATUS_LIST, type ProgramStatus } from "@/lib/program-status";
import { cn } from "@/lib/utils";
import type { Company, Program } from "@/types";

const PAGE_SIZE = 10;

/**
 * 기업·심사자 권한 — 심사자별 담당 범위와 기업 심사 잠금을 한 화면에서 본다.
 *
 * '누가 무엇을 심사할 수 있는가'(계정)와 '무엇을 더 이상 못 바꾸는가'(잠금)는
 * 둘 다 권한 문제라 함께 두고, 사업 자체의 설정은 '지원사업 설정'으로 분리했다.
 */
export function Permissions({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const { locks, toggleLock, assigns, statuses: adminStatuses } = useAdminState();
  const [q, setQ] = useState("");
  const [accountQ, setAccountQ] = useState("");
  const [lockedOnly, setLockedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [openAssignee, setOpenAssignee] = useState<DemoAccount | null>(null);

  useEffect(() => setPage(0), [q, lockedOnly]);

  const ref = useMemo(() => dashboardReferenceDate(programs), [programs]);

  const lockedCount = Object.values(locks).filter(Boolean).length;

  const accounts = useMemo(() => {
    const needle = accountQ.trim().toLowerCase();
    return DEMO_ACCOUNTS.filter(
      (a) => !needle || a.name.toLowerCase().includes(needle) || a.username.toLowerCase().includes(needle)
    ).map((a) => {
      const assigned = programs.filter((p) => assigns[programKey(p)] === a.username);
      return { account: a, assigned };
    });
  }, [programs, assigns, accountQ]);

  // 상태가 정해진 기업(후보 아님)을 위로 — 잠글 대상이 먼저 보이게
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = companies.filter((c) => {
      if (lockedOnly && !locks[c.id]) return false;
      if (!needle) return true;
      return c.name.toLowerCase().includes(needle) || (c.industry ?? "").toLowerCase().includes(needle);
    });
    // 심사 상태가 (기업 × 사업) 단위로 바뀌어 단일 기업 상태가 없다 → 종합점수순으로만 정렬.
    return [...matched].sort(
      (a, b) => (computeOverallScore(b.scores) ?? 0) - (computeOverallScore(a.scores) ?? 0),
    );
  }, [companies, q, lockedOnly, locks]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageItems = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h1 className="text-[20px] font-extrabold tracking-tight">기업·심사자 권한</h1>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          심사자별 담당 범위를 확인하고, 확정된 기업의 심사를 잠급니다.
        </p>
      </div>

      <div className="rounded-lg border p-3.5">
        <div className="mb-2 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[12.5px] font-bold">심사자 계정</p>
        </div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={accountQ}
            onChange={(e) => setAccountQ(e.target.value)}
            placeholder="담당자명 · 아이디 검색"
            className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-[12.5px] outline-none focus:border-primary"
          />
        </div>
        {accounts.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-muted-foreground">검색 결과가 없습니다.</p>
        ) : (
        <div className="divide-y">
          {accounts.map(({ account: a, assigned }) => {
            const clickable = a.role === "담당자";
            return (
              <button
                key={a.username}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && setOpenAssignee(a)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 py-2.5 text-left",
                  clickable && "hover:bg-muted/40"
                )}
              >
                <p className="text-[12.5px]">
                  {a.name} <span className="text-muted-foreground">({a.username})</span>
                </p>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant={a.role === "관리자" ? "info" : "secondary"}>{a.role}</Badge>
                  <span className="tabular-nums text-[11px] text-muted-foreground">
                    {a.role === "관리자" ? "전체" : `배정 ${assigned.length}건`}
                  </span>
                  {clickable && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </span>
              </button>
            );
          })}
        </div>
        )}
        <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
          사업 배정은{" "}
          <Link href="/admin" className="text-primary hover:underline">
            지원사업 설정
          </Link>
          에서 변경합니다.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-bold">심사 잠금</p>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {lockedCount} / {companies.length} 잠김
          </span>
        </div>
        <p className="text-[12px] text-muted-foreground">
          잠근 기업은 담당자가 심사 상태를 바꿀 수 없습니다. 관리자만 해제할 수 있습니다.
        </p>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="기업명 · 업종 검색"
              className="w-full rounded-md border bg-background py-2 pl-8 pr-3 text-[12.5px] outline-none focus:border-primary"
            />
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={lockedOnly}
              onChange={(e) => setLockedOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            잠긴 기업만
          </label>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border p-8 text-center text-[12.5px] text-muted-foreground">
            {lockedOnly ? "잠긴 기업이 없습니다." : "검색 결과가 없습니다."}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="divide-y rounded-lg border">
              {pageItems.map((c) => {
                const locked = Boolean(locks[c.id]);
                return (
                  <div key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <Link href={`/companies/${c.id}`} className="min-w-0 flex-1 hover:underline">
                      <p className="truncate text-[12.5px] font-medium">{c.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{c.industry ?? "업종 미상"}</p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleLock(c.id)}
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                        locked ? "bg-bad-bg text-bad" : "bg-muted text-muted-foreground hover:bg-muted/70"
                      )}
                    >
                      {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                      {locked ? "잠김" : "잠금"}
                    </button>
                  </div>
                );
              })}
            </div>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>

      <p className="rounded-lg bg-muted/40 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        ※ 잠금 상태는 <b>이 브라우저에만</b> 저장됩니다(백엔드 미연동).
      </p>

      {openAssignee && (
        <AssignedProgramsModal
          account={openAssignee}
          programs={programs.filter((p) => assigns[programKey(p)] === openAssignee.username)}
          referenceDate={ref}
          statusOverrides={adminStatuses}
          onClose={() => setOpenAssignee(null)}
        />
      )}
    </div>
  );
}

/** 담당자 배정 사업 전체 목록 — 진행중/예정/완료를 다 보여준다("완료된 사업은
 *  안 보인다"는 인상을 주면 안 된다. 담당자는 끝난 심사 결과도 확인해야 한다). */
function AssignedProgramsModal({
  account,
  programs,
  referenceDate,
  statusOverrides,
  onClose,
}: {
  account: DemoAccount;
  programs: Program[];
  referenceDate: Date;
  statusOverrides: Record<string, ProgramStatus>;
  onClose: () => void;
}) {
  // 기본은 진행중만 — program-settings.tsx와 동일한 이유: 완료 건이 대부분이라
  // 전체를 깔면 지금 신경 써야 할 진행중 건이 묻힌다.
  const [statusTab, setStatusTab] = useState<ProgramStatus | "전체">("진행중");

  const withStatus = useMemo(
    () => programs.map((p) => ({ program: p, status: resolveProgramStatus(p, referenceDate, statusOverrides) })),
    [programs, referenceDate, statusOverrides]
  );

  const statusCounts = useMemo(() => {
    const c: Record<ProgramStatus, number> = { 예정: 0, 진행중: 0, 완료: 0 };
    for (const { status } of withStatus) c[status]++;
    return c;
  }, [withStatus]);

  const sorted = useMemo(
    () =>
      withStatus
        .filter(({ status }) => statusTab === "전체" || status === statusTab)
        .sort(
          (a, b) =>
            b.program.year - a.program.year ||
            ((a.program.name ?? "") < (b.program.name ?? "") ? -1 : 1)
        ),
    [withStatus, statusTab]
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl bg-card shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-[13.5px] font-bold">{account.name}의 배정 사업</p>
            <p className="text-[11px] text-muted-foreground">{account.username} · 총 {programs.length}건</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5">
          {(["진행중", "완료", "예정", "전체"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setStatusTab(t)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                statusTab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {t}
              <span className="ml-1 tabular-nums opacity-70">
                {t === "전체" ? programs.length : statusCounts[t]}
              </span>
            </button>
          ))}
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="p-8 text-center text-[12.5px] text-muted-foreground">
              {programs.length === 0 ? "배정된 사업이 없습니다." : `'${statusTab}' 상태인 사업이 없습니다.`}
            </p>
          ) : (
            <div className="divide-y">
              {sorted.map(({ program: p, status }) => (
                <div key={programKey(p)} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium">{p.name ?? p.programCode}</p>
                    <p className="text-[11px] text-muted-foreground">{p.year}년 · 신청 {p.applicantCount}개사</p>
                  </div>
                  <Badge variant={PROGRAM_STATUS_BADGE[status]} className="shrink-0">{status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
