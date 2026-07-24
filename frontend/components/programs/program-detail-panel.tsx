"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Calendar, ChevronDown, Landmark, Maximize2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Company, Note, Program } from "@/types";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  businessTypeLabel,
  resolveProgramStatus,
  PROGRAM_STATUS_BADGE,
} from "@/lib/program-status";
import {
  coSupportedPrograms,
  coSupportThreshold,
  overlapCompanyCount,
  programKeyOf,
  sameProgramRepeat,
  selectedCompanies,
  type CoSupportedProgram,
} from "@/lib/program-filters";
import { formatKRW } from "@/lib/utils";
import { MentionedNotes } from "@/components/notes/notes-explorer";
import { mentionsProgram } from "@/lib/notes";
import { useAdminState } from "@/lib/admin-state";
import { useAuth, isAdmin } from "@/lib/auth";
import { programKey } from "@/lib/program-progress";

/** "함께 받은 다른 사업" 행 하나(사업명 기준, 여러 연도를 묶을 수 있음)가 가리키는
 * 실제 Program을 찾는다 — 가장 최근 연도의 것을 연다. */
function resolveCoProgram(
  co: CoSupportedProgram,
  allPrograms: Program[],
): Program | undefined {
  const latestYear = co.years[co.years.length - 1];
  return allPrograms.find(
    (pr) => (pr.name ?? pr.programCode) === co.name && pr.year === latestYear,
  );
}

export function ProgramDetailPanel({
  program: p,
  programs,
  companies,
  notes,
  referenceDate,
  onClose,
  onSelectProgram,
}: {
  program: Program;
  programs: Program[];
  companies: Company[];
  notes: Note[];
  referenceDate: Date;
  onClose: () => void;
  onSelectProgram: (key: string) => void;
}) {
  const router = useRouter();

  // 지원 사업 화면은 전 사업 '열람'용 — 심사 진입은 배정받은 사업에만 연다(관리자는 전체).
  const { assigns, statuses: adminStatuses } = useAdminState();
  const { user } = useAuth();
  const status = resolveProgramStatus(p, referenceDate, adminStatuses);
  const canReview = isAdmin(user) || assigns[programKey(p)] === user?.username;

  const [showAllCo, setShowAllCo] = useState(false);
  const [expandedCo, setExpandedCo] = useState<Set<string>>(new Set());
  const toggleCoExpanded = (name: string) =>
    setExpandedCo((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const companyById = useMemo(
    () => new Map(companies.map((c) => [c.id, c])),
    [companies],
  );

  const selected = useMemo(
    () => selectedCompanies(p, companies),
    [p, companies],
  );
  const coSupported = useMemo(
    () => coSupportedPrograms(p, companies, programs),
    [p, companies, programs],
  );
  const repeat = useMemo(
    () => sameProgramRepeat(p, companies, programs),
    [p, companies, programs],
  );
  const overlapCount = useMemo(
    () => overlapCompanyCount(p, companies),
    [p, companies],
  );
  // 기업 id → 이 기업이 겹치는 다른 사업명들 — "선정 기업" 목록 행에 바로 표시하기 위함.
  // 사업 상자 쪽에 기업명을 나열하면 기업 수가 늘어날수록 줄이 잘리므로, 목록 쪽에 붙인다.
  const coProgramsByCompany = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const co of coSupported) {
      for (const id of co.companyIds)
        m.set(id, [...(m.get(id) ?? []), co.name]);
    }
    return m;
  }, [coSupported]);
  const noRecord = p.applicantCount === 0;
  const missing = p.amountMissingCount ?? 0;

  // 겹침 1개사짜리 꼬리가 목록의 대부분을 차지한다(샘플에서도 66%). 판정선 미만은 접어둔다.
  const threshold = coSupportThreshold(selected.length);
  const significant = coSupported.filter((c) => c.overlapCount >= threshold);
  const minor = coSupported.filter((c) => c.overlapCount < threshold);
  const visibleCo = showAllCo ? coSupported : significant;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <Badge variant={PROGRAM_STATUS_BADGE[status]}>{status}</Badge>
        <div className="flex shrink-0 items-center gap-1">
          {canReview && (
            <button
              onClick={() =>
                router.push(`/companies?program=${p.year}:${p.programCode}`)
              }
              aria-label="이 사업의 기업 심사 화면 열기"
              title="심사하기"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-[17px] font-extrabold leading-snug tracking-tight">
          {p.name ?? p.programCode}
        </h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="info">{businessTypeLabel(p.businessType)}</Badge>
          {/* macroCategory는 businessType과 다른 분류축(상위 카테고리)이라 보통 함께 보여줄 가치가 있지만,
              RnD처럼 값이 같아지는 사업에서는 "R&D"·"RnD" 중복 뱃지로만 보인다 — 그 경우만 숨긴다. */}
          {p.macroCategory &&
            p.macroCategory !== businessTypeLabel(p.businessType) && (
              <Badge variant="secondary">{p.macroCategory}</Badge>
            )}
          <span className="text-[11px] text-muted-foreground">
            {p.year}년 · {p.programCode}
          </span>
        </div>
      </div>

      {p.description && (
        <p className="rounded-lg bg-subtle p-3 text-[12px] leading-relaxed text-muted-foreground">
          {p.description}
        </p>
      )}

      <div className="space-y-1.5 text-[12px]">
        <Row
          icon={<Landmark className="h-3.5 w-3.5" />}
          label="부처"
          value={p.ministry ?? "—"}
        />
        <Row
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="사업기간"
          value={
            p.startDate && p.endDate ? `${p.startDate} ~ ${p.endDate}` : "—"
          }
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="신청 기업"
          value={noRecord ? "—" : `${p.applicantCount}개`}
        />
        <StatCard
          label="선정 기업"
          value={noRecord ? "—" : `${p.selectedCount}개`}
          sub={
            !noRecord && p.selectedCount === 0 ? "전원 탈락/포기" : undefined
          }
        />
        <StatCard
          label="총 지원금"
          value={
            noRecord || p.selectedCount === 0
              ? "—"
              : formatKRW(p.totalAmountThousand)
          }
          sub={missing > 0 ? `${missing}건 미기재` : undefined}
        />
      </div>

      {selected.length > 0 && (repeat.companyCount > 0 || overlapCount > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="반복 수혜"
            value={`${repeat.companyCount}개사`}
            sub={
              repeat.companyCount > 0
                ? `${repeat.years.join("·")}년에도 선정됨`
                : "해당 없음"
            }
            className={repeat.companyCount > 0 ? "bg-warn-bg" : undefined}
          />
          <StatCard
            label="중복 수혜"
            value={`${overlapCount}개사`}
            sub={
              overlapCount > 0
                ? coSupported.length > 2
                  ? `${coSupported.slice(0, 2).map((c) => c.name).join(", ")} 외 ${coSupported.length - 2}건`
                  : coSupported.map((c) => c.name).join(", ")
                : "해당 없음"
            }
            className={overlapCount > 0 ? "bg-warn-bg" : undefined}
          />
        </div>
      )}

      {p.detailItems.length > 0 && (
        <Section title="세부 품목">
          <div className="flex flex-wrap gap-1.5">
            {p.detailItems.map((d) => (
              <Badge key={d} variant="secondary" className="text-[11px]">
                {d}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {selected.length > 0 && (
        <Section title={`선정 기업 ${selected.length}개`}>
          <div className="divide-y rounded-lg border">
            {selected.map((c) => {
              // 이 사업(연도+코드)에 대한 선정 레코드 — 같은 기업이라도 선정일은 개별로 다를 수 있다.
              const record = c.supportHistory.find(
                (h) =>
                  h.result === "선정" &&
                  h.year === p.year &&
                  h.programCode === p.programCode,
              );
              const isRepeat = repeat.companyIds.includes(c.id);
              const coNames = coProgramsByCompany.get(c.id) ?? [];
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/companies/${c.id}`)}
                  className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium">
                        {c.name}
                      </span>
                      {isRepeat && (
                        <span
                          title={`${(repeat.yearsByCompany[c.id] ?? []).join("·")}년에도 이 사업에 선정됐습니다.`}
                          className="shrink-0 rounded-full bg-warn-bg px-1.5 py-0.5 text-[9.5px] font-bold text-[hsl(30_75%_38%)]"
                        >
                          반복
                        </span>
                      )}
                      {coNames.length > 0 && (
                        <span
                          title={`함께 받은 사업: ${coNames.join(", ")}`}
                          className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground"
                        >
                          중복 {coNames.length}건
                        </span>
                      )}
                    </span>
                    {record?.date && (
                      <span className="block text-[10.5px] tabular-nums text-muted-foreground">
                        선정일 {record.date}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                    {c.industry ?? "업종 미상"}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {coSupported.length > 0 && (
        <Section title="함께 받은 다른 사업">
          <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
            이 사업 선정 기업이 다른 사업에서도 선정된 내역입니다. 같은 기업
            풀이 반복되면 중복 수혜 검토가 필요합니다.
          </p>
          {visibleCo.length === 0 ? (
            <p className="rounded-lg bg-subtle px-3 py-2.5 text-[11.5px] text-muted-foreground">
              {threshold}개사 이상 겹치는 사업이 없습니다
            </p>
          ) : (
            <div className="space-y-2">
              {visibleCo.map((co) => {
                const target = resolveCoProgram(co, programs);
                const isExpanded = expandedCo.has(co.name);
                const overlapCompanies = co.companyIds
                  .map((id) => companyById.get(id))
                  .filter((c): c is Company => c != null);
                return (
                  <div key={co.name} className="rounded-lg border">
                    <div className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left">
                      <button
                        type="button"
                        onClick={() =>
                          target && onSelectProgram(programKeyOf(target))
                        }
                        disabled={!target}
                        className="min-w-0 truncate text-[12.5px] font-medium hover:underline disabled:cursor-default disabled:no-underline"
                      >
                        {co.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCoExpanded(co.name)}
                        aria-expanded={isExpanded}
                        className={`flex shrink-0 items-center gap-1 text-[11.5px] font-medium tabular-nums hover:underline ${
                          co.overlapCount >= threshold
                            ? ""
                            : "text-muted-foreground"
                        }`}
                      >
                        {co.overlapCount}개사
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="divide-y border-t">
                        {overlapCompanies.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => router.push(`/companies/${c.id}`)}
                            className="flex w-full items-center justify-between gap-2 truncate px-3.5 py-2 text-left text-[11.5px] hover:bg-muted"
                          >
                            <span className="truncate">{c.name}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {(co.yearsByCompany[c.id] ?? []).join("·")}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {minor.length > 0 && (
            <button
              onClick={() => setShowAllCo((v) => !v)}
              className="mt-1.5 px-2 text-[11.5px] text-primary hover:underline"
            >
              {showAllCo
                ? "겹침 적은 사업 접기"
                : `겹침 ${threshold}개사 미만 ${minor.length}건 더보기`}
            </button>
          )}
        </Section>
      )}

      <Section title="이 사업이 언급된 메모">
        <MentionedNotes
          notes={notes.filter((n) => mentionsProgram(n, p.year, p.programCode))}
          emptyText="아직 이 사업을 언급한 메모가 없습니다. 메모에서 #으로 언급하면 여기 모입니다."
        />
      </Section>

      {noRecord && (
        <p className="rounded-lg bg-subtle p-3 text-[11.5px] leading-relaxed text-muted-foreground">
          이 사업에 매칭된 신청 기록이 없습니다. 보유 데이터에 해당 사업의 기업
          지원 내역이 포함되지 않은 경우입니다.
        </p>
      )}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[12.5px] font-bold">{title}</p>
      {children}
    </div>
  );
}
