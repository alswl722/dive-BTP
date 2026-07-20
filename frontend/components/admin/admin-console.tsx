"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardCheck, Lock, LockOpen, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { useAdminState } from "@/lib/admin-state";
import { useNotices } from "@/lib/notices";
import { NoticeEditor } from "@/components/admin/notice-editor";
import { useAuth, DEMO_ACCOUNTS } from "@/lib/auth";
import { useReviewStatus } from "@/lib/app-state";
import { computeOverallScore } from "@/lib/scoring";
import { dashboardReferenceDate, programApplicantIds } from "@/lib/program-progress";
import { cn } from "@/lib/utils";
import type { Company, Program } from "@/types";

const TAB_LIST = ["공지사항", "심사 잠금", "담당 배정", "사업 점검"] as const;
type Tab = (typeof TAB_LIST)[number];

export function AdminConsole({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const [tab, setTab] = useState<Tab>("공지사항");
  const { user } = useAuth();
  const { locks, confirms } = useAdminState();
  const { notices } = useNotices();

  const lockedCount = Object.values(locks).filter(Boolean).length;
  const confirmedCount = Object.values(confirms).filter(Boolean).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-[20px] font-extrabold tracking-tight">관리자 콘솔</h1>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {user?.name} · {user?.dept} — 심사 확정 잠금, 담당자 배정, 사업별 점검을 관리합니다.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="잠긴 기업" value={lockedCount} total={companies.length} />
        <SummaryTile label="점검 완료 사업" value={confirmedCount} total={programs.length} />
        <SummaryTile label="공지" value={notices.length} />
      </div>

      <Tabs tabs={[...TAB_LIST]} active={tab} onChange={(t) => setTab(t as Tab)} />

      {tab === "공지사항" && <NoticeEditor />}
      {tab === "심사 잠금" && <LockPanel companies={companies} />}
      {tab === "담당 배정" && <AssignPanel programs={programs} companies={companies} />}
      {tab === "사업 점검" && <ConfirmPanel programs={programs} companies={companies} />}

      <p className="rounded-lg bg-muted/40 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        ※ 현재 잠금·배정·점검 상태는 <b>브라우저 세션에만</b> 저장됩니다(백엔드 미연동).
        탭을 닫으면 초기화되며 다른 사용자와 공유되지 않습니다.
      </p>
    </div>
  );
}

function SummaryTile({ label, value, total }: { label: string; value: number; total?: number }) {
  return (
    <div className="rounded-lg bg-subtle py-3 text-center">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[20px] font-extrabold tabular-nums">
        {value}
        {total != null && <span className="text-[12px] font-normal text-muted-foreground"> / {total}</span>}
      </p>
    </div>
  );
}

/** 심사 잠금 — 확정된 기업의 상태 변경을 막는다. */
function LockPanel({ companies }: { companies: Company[] }) {
  const { locks, toggleLock } = useAdminState();
  const { statuses } = useReviewStatus();

  // 상태가 정해진 기업(후보 아님)을 위로 — 잠글 대상이 먼저 보이게
  const sorted = useMemo(
    () =>
      [...companies].sort((a, b) => {
        const sa = statuses[a.id] ?? a.reviewStatus;
        const sb = statuses[b.id] ?? b.reviewStatus;
        const decided = (s: string) => (s === "후보" ? 1 : 0);
        return decided(sa) - decided(sb) || (computeOverallScore(b.scores) ?? 0) - (computeOverallScore(a.scores) ?? 0);
      }),
    [companies, statuses]
  );

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">
        심사가 끝난 기업을 잠그면 담당자가 상태를 바꿀 수 없습니다. 관리자만 해제할 수 있습니다.
      </p>
      <div className="divide-y rounded-lg border">
        {sorted.map((c) => {
          const locked = Boolean(locks[c.id]);
          const status = statuses[c.id] ?? c.reviewStatus;
          return (
            <div key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <Link href={`/companies/${c.id}`} className="min-w-0 flex-1 hover:underline">
                <p className="truncate text-[12.5px] font-medium">{c.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{c.industry ?? "업종 미상"}</p>
              </Link>
              <Badge variant={status === "선정" ? "good" : status === "제외" ? "bad" : status === "보류" ? "warn" : "secondary"}>
                {status}
              </Badge>
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
    </div>
  );
}

/** 담당 배정 — 사업별 담당자 지정. */
function AssignPanel({ programs, companies }: { programs: Program[]; companies: Company[] }) {
  const { assigns, setAssign } = useAdminState();
  const ref = useMemo(() => dashboardReferenceDate(programs), [programs]);

  // 신청 기업이 있는 사업만 — 배정 대상이 되는 실제 심사 건
  const targets = useMemo(
    () => programs.filter((p) => p.applicantCount > 0).slice(0, 30),
    [programs]
  );
  void ref;

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">
        사업별 심사 담당자를 지정합니다. 배정된 담당자에게 해당 사업의 신청 기업이 우선 노출됩니다.
      </p>
      <div className="divide-y rounded-lg border">
        {targets.map((p) => {
          const key = `${p.year}:${p.programCode}`;
          const applicants = programApplicantIds(p, companies).length;
          return (
            <div key={key} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium">{p.name ?? p.programCode}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {p.year} · {p.businessType ?? "기타"} · 신청 {applicants}개사
                </p>
              </div>
              <select
                value={assigns[key] ?? ""}
                onChange={(e) => setAssign(key, e.target.value)}
                className="shrink-0 rounded-md border bg-background px-2 py-1.5 text-[11.5px] outline-none focus:border-primary"
              >
                <option value="">미배정</option>
                {DEMO_ACCOUNTS.map((a) => (
                  <option key={a.username} value={a.username}>
                    {a.name} ({a.username})
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border p-3.5">
        <div className="mb-2 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[12.5px] font-bold">계정 목록</p>
        </div>
        <div className="divide-y">
          {DEMO_ACCOUNTS.map((a) => {
            const count = Object.values(assigns).filter((u) => u === a.username).length;
            return (
              <div key={a.username} className="flex items-center justify-between py-2 text-[12px]">
                <span>
                  {a.name} <span className="text-muted-foreground">({a.username})</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={a.role === "관리자" ? "info" : "secondary"}>{a.role}</Badge>
                  <span className="tabular-nums text-[11px] text-muted-foreground">배정 {count}건</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 사업 점검 — 심사 진행 상황 확인 후 관리자가 확정. */
function ConfirmPanel({ programs, companies }: { programs: Program[]; companies: Company[] }) {
  const { confirms, toggleConfirm } = useAdminState();
  const { statuses } = useReviewStatus();

  const rows = useMemo(
    () =>
      programs
        .filter((p) => p.applicantCount > 0)
        .map((p) => {
          const ids = programApplicantIds(p, companies);
          const reviewed = ids.filter((id) => {
            const c = companies.find((x) => x.id === id);
            return c && (statuses[c.id] ?? c.reviewStatus) !== "후보";
          }).length;
          return { p, total: ids.length, reviewed };
        })
        .sort((a, b) => b.reviewed / (b.total || 1) - a.reviewed / (a.total || 1))
        .slice(0, 30),
    [programs, companies, statuses]
  );

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">
        사업별 심사 진행률을 확인하고 점검을 완료 처리합니다. 미검토가 남은 사업은 확정 전에 확인하세요.
      </p>
      <div className="divide-y rounded-lg border">
        {rows.map(({ p, total, reviewed }) => {
          const key = `${p.year}:${p.programCode}`;
          const done = Boolean(confirms[key]);
          const pctVal = total ? Math.round((reviewed / total) * 100) : 0;
          const remaining = total - reviewed;
          return (
            <div key={key} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium">{p.name ?? p.programCode}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-info" style={{ width: `${pctVal}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {reviewed}/{total} 심사완료
                    {remaining > 0 && <span className="text-warn"> · 미검토 {remaining}</span>}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleConfirm(key)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  done ? "bg-good-bg text-good" : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                {done ? "점검완료" : "점검"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
