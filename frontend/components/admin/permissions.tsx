"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KeyRound, Lock, LockOpen, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAdminState } from "@/lib/admin-state";
import { DEMO_ACCOUNTS } from "@/lib/auth";
import { useReviewStatus } from "@/lib/app-state";
import { computeOverallScore } from "@/lib/scoring";
import { programKey } from "@/lib/program-progress";
import { cn } from "@/lib/utils";
import type { Company, Program } from "@/types";

/**
 * 기업·심사자 권한 — 심사자별 담당 범위와 기업 심사 잠금을 한 화면에서 본다.
 *
 * '누가 무엇을 심사할 수 있는가'(계정)와 '무엇을 더 이상 못 바꾸는가'(잠금)는
 * 둘 다 권한 문제라 함께 두고, 사업 자체의 설정은 '지원사업 설정'으로 분리했다.
 */
export function Permissions({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const { locks, toggleLock, assigns } = useAdminState();
  const { statuses } = useReviewStatus();
  const [q, setQ] = useState("");

  const lockedCount = Object.values(locks).filter(Boolean).length;

  const accounts = useMemo(
    () =>
      DEMO_ACCOUNTS.map((a) => {
        const assigned = programs.filter((p) => assigns[programKey(p)] === a.username);
        return { account: a, assigned };
      }),
    [programs, assigns]
  );

  // 상태가 정해진 기업(후보 아님)을 위로 — 잠글 대상이 먼저 보이게
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = needle
      ? companies.filter(
          (c) => c.name.toLowerCase().includes(needle) || (c.industry ?? "").toLowerCase().includes(needle)
        )
      : companies;
    return [...matched].sort((a, b) => {
      const sa = statuses[a.id] ?? a.reviewStatus;
      const sb = statuses[b.id] ?? b.reviewStatus;
      const decided = (s: string) => (s === "후보" ? 1 : 0);
      return decided(sa) - decided(sb) || (computeOverallScore(b.scores) ?? 0) - (computeOverallScore(a.scores) ?? 0);
    });
  }, [companies, statuses, q]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
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
        <div className="divide-y">
          {accounts.map(({ account: a, assigned }) => (
            <div key={a.username} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[12.5px]">
                  {a.name} <span className="text-muted-foreground">({a.username})</span>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {a.role === "관리자"
                    ? "전 사업 심사 · 설정 · 공지 작성"
                    : assigned.length > 0
                      ? assigned.map((p) => p.name ?? p.programCode).join(", ")
                      : "배정된 사업 없음"}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <Badge variant={a.role === "관리자" ? "info" : "secondary"}>{a.role}</Badge>
                <span className="tabular-nums text-[11px] text-muted-foreground">
                  {a.role === "관리자" ? "전체" : `배정 ${assigned.length}건`}
                </span>
              </span>
            </div>
          ))}
        </div>
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

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="기업명 · 업종 검색"
            className="w-full rounded-md border bg-background py-2 pl-8 pr-3 text-[12.5px] outline-none focus:border-primary"
          />
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border p-8 text-center text-[12.5px] text-muted-foreground">
            검색 결과가 없습니다.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {rows.map((c) => {
              const locked = Boolean(locks[c.id]);
              const status = statuses[c.id] ?? c.reviewStatus;
              return (
                <div key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <Link href={`/companies/${c.id}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate text-[12.5px] font-medium">{c.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{c.industry ?? "업종 미상"}</p>
                  </Link>
                  <Badge
                    variant={status === "선정" ? "good" : status === "제외" ? "bad" : status === "보류" ? "warn" : "secondary"}
                  >
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
        )}
      </div>

      <p className="rounded-lg bg-muted/40 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        ※ 잠금 상태는 <b>이 브라우저에만</b> 저장됩니다(백엔드 미연동).
      </p>
    </div>
  );
}
