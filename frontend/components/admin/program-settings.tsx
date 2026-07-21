"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, Settings2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { useAdminState } from "@/lib/admin-state";
import { DEMO_ACCOUNTS } from "@/lib/auth";
import { dashboardReferenceDate, programApplicantIds, programKey } from "@/lib/program-progress";
import { PROGRAM_STATUS_BADGE, PROGRAM_STATUS_LIST, resolveProgramStatus, type ProgramStatus } from "@/lib/program-status";
import { cn } from "@/lib/utils";
import type { Company, Program } from "@/types";

/** 배정 대상은 담당자만 — 관리자는 배정과 무관하게 전 사업을 심사할 수 있어 선택지로 두면 오해를 준다. */
const ASSIGNABLE = DEMO_ACCOUNTS.filter((a) => a.role === "담당자");

const PAGE_SIZE = 10;

/**
 * 지원사업 설정 — 사업별 담당자 배정과 진행 상태 지정.
 *
 * 배정은 초안(draft)에 모았다가 '저장'으로 한 번에 반영한다. 즉시 반영이면
 * 여러 건을 손보는 도중 실수 하나가 바로 담당자 화면에 나가고, 무엇을 바꿨는지
 * 되짚을 수 없다. 상태 지정은 단건이라 즉시 반영한다.
 */
export function ProgramSettings({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const { assigns, applyAssigns, statuses, setProgramStatus } = useAdminState();
  const [draft, setDraft] = useState(assigns);
  const [q, setQ] = useState("");
  const [savedAt, setSavedAt] = useState(false);
  // 기본은 진행중만 — 끝난 사업이 목록의 대부분(표본 52건 중 39건)이라
  // 전체를 깔면 지금 배정해야 할 건이 묻힌다.
  const [statusTab, setStatusTab] = useState<ProgramStatus | "전체">("진행중");
  const [page, setPage] = useState(0);

  // 다른 화면에서 배정이 바뀌었거나 세션 복원이 늦게 끝난 경우 초안을 맞춰준다
  useEffect(() => setDraft(assigns), [assigns]);
  useEffect(() => setPage(0), [q, statusTab]);

  const ref = useMemo(() => dashboardReferenceDate(programs), [programs]);

  // 신청 기업이 있는 사업 = 실제 심사가 발생하는 건. 잘라내지 않는다(잘리면 영영 배정 불가).
  const withApplicants = useMemo(() => programs.filter((p) => p.applicantCount > 0), [programs]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { 예정: 0, 진행중: 0, 완료: 0 };
    for (const p of withApplicants) c[resolveProgramStatus(p, ref, statuses)]++;
    return c;
  }, [withApplicants, ref, statuses]);

  const targets = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = withApplicants.filter((p) => {
      if (statusTab !== "전체" && resolveProgramStatus(p, ref, statuses) !== statusTab) return false;
      if (!needle) return true;
      return (
        (p.name ?? "").toLowerCase().includes(needle) ||
        (p.programCode ?? "").toLowerCase().includes(needle) ||
        String(p.year).includes(needle)
      );
    });
    return [...matched].sort((a, b) => b.year - a.year || ((a.name ?? "") < (b.name ?? "") ? -1 : 1));
  }, [withApplicants, q, statusTab, ref, statuses]);

  const totalPages = Math.max(1, Math.ceil(targets.length / PAGE_SIZE));
  const pageItems = targets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const total = withApplicants.length;
  const unassigned = total - Object.values(assigns).filter(Boolean).length;
  const dirty = useMemo(
    () =>
      Object.keys({ ...draft, ...assigns }).filter((k) => (draft[k] ?? "") !== (assigns[k] ?? "")).length,
    [draft, assigns]
  );

  function save() {
    // 빈 문자열(미배정)은 저장값에 남기지 않는다 — 배정 건수 집계가 틀어진다
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) if (v) cleaned[k] = v;
    applyAssigns(cleaned);
    setSavedAt(true);
    window.setTimeout(() => setSavedAt(false), 2000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <h1 className="text-[20px] font-extrabold tracking-tight">지원사업 설정</h1>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          사업별 심사 담당자를 배정하고 진행 상태를 지정합니다. 배정된 담당자만 해당 사업을 심사할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="심사 대상 사업" value={total} />
        <SummaryTile label="미배정" value={unassigned} tone={unassigned > 0 ? "warn" : "good"} />
        <SummaryTile label="상태 지정" value={Object.keys(statuses).length} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["진행중", "완료", "예정", "전체"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setStatusTab(t)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
              statusTab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {t}
            <span className="ml-1 tabular-nums opacity-70">
              {t === "전체" ? total : statusCounts[t]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="사업명 · 사업코드 · 연도 검색"
            className="w-full rounded-md border bg-background py-2 pl-8 pr-3 text-[12.5px] outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={dirty === 0}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-medium transition-colors",
            dirty > 0
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : savedAt
                ? "bg-good-bg text-good"
                : "bg-muted text-muted-foreground"
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {dirty > 0 ? `저장 (${dirty}건)` : savedAt ? "저장됨" : "저장"}
        </button>
      </div>

      {targets.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-[12.5px] text-muted-foreground">
          {q.trim() ? "검색 결과가 없습니다." : `'${statusTab}' 상태인 사업이 없습니다.`}
        </p>
      ) : (
        <div className="space-y-3">
        <div className="divide-y rounded-lg border">
          {pageItems.map((p) => {
            const key = programKey(p);
            const applicants = programApplicantIds(p, companies).length;
            const status = resolveProgramStatus(p, ref, statuses);
            const overridden = key in statuses;
            const changed = (draft[key] ?? "") !== (assigns[key] ?? "");
            return (
              <div key={key} className={cn("flex flex-wrap items-center gap-2.5 px-3.5 py-2.5", changed && "bg-info-bg/40")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{p.name ?? p.programCode}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {p.year} · {p.businessType ?? "기타"} · 신청 {applicants}개사
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant={PROGRAM_STATUS_BADGE[status]}>{status}</Badge>
                  <select
                    value={overridden ? status : ""}
                    onChange={(e) => setProgramStatus(key, (e.target.value || null) as ProgramStatus | null)}
                    title="진행 상태 지정"
                    className="rounded-md border bg-background px-2 py-1.5 text-[11.5px] outline-none focus:border-primary"
                  >
                    <option value="">자동 (시작일·종료일)</option>
                    {PROGRAM_STATUS_LIST.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {overridden && (
                    <button
                      type="button"
                      onClick={() => setProgramStatus(key, null)}
                      title="자동 판정으로 되돌리기"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <select
                  value={draft[key] ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                  title="심사 담당자"
                  className="shrink-0 rounded-md border bg-background px-2 py-1.5 text-[11.5px] outline-none focus:border-primary"
                >
                  <option value="">미배정</option>
                  {ASSIGNABLE.map((a) => (
                    <option key={a.username} value={a.username}>
                      {a.name} ({a.username})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      <p className="rounded-lg bg-muted/40 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        ※ 배정·상태는 <b>이 브라우저에만</b> 저장됩니다(백엔드 미연동). 같은 브라우저의 다른 탭에는 즉시 반영되지만, 다른 PC와는 공유되지 않습니다.
      </p>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: "warn" | "good" }) {
  return (
    <div className="rounded-lg bg-subtle py-3 text-center">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[20px] font-extrabold tabular-nums",
          tone === "warn" && "text-warn",
          tone === "good" && "text-good"
        )}
      >
        {value}
      </p>
    </div>
  );
}
