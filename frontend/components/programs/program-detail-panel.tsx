"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Building2, Calendar, Landmark, Maximize2, Repeat, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Company, Note, Program } from "@/types";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { businessTypeLabel, programStatus, PROGRAM_STATUS_BADGE } from "@/lib/program-status";
import { coSupportedPrograms, coSupportThreshold, sameProgramRepeat, selectedCompanies } from "@/lib/program-filters";
import { formatKRW } from "@/lib/utils";
import { MentionedNotes } from "@/components/notes/notes-explorer";
import { mentionsProgram } from "@/lib/notes";

export function ProgramDetailPanel({
  program: p,
  programs,
  companies,
  notes,
  referenceDate,
  onClose,
}: {
  program: Program;
  programs: Program[];
  companies: Company[];
  notes: Note[];
  referenceDate: Date;
  onClose: () => void;
}) {
  const router = useRouter();
  const status = programStatus(p, referenceDate);

  const [showAllCo, setShowAllCo] = useState(false);

  const selected = useMemo(() => selectedCompanies(p, companies), [p, companies]);
  const coSupported = useMemo(() => coSupportedPrograms(p, companies, programs), [p, companies, programs]);
  const repeat = useMemo(() => sameProgramRepeat(p, companies, programs), [p, companies, programs]);
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
          <button
            onClick={() => router.push(`/companies?program=${p.year}:${p.programCode}`)}
            aria-label="이 사업의 기업 목록 열기"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
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
        <h2 className="text-[17px] font-extrabold leading-snug tracking-tight">{p.name ?? p.programCode}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="info">{businessTypeLabel(p.businessType)}</Badge>
          {p.macroCategory && <Badge variant="secondary">{p.macroCategory}</Badge>}
          <span className="text-[11px] text-muted-foreground">{p.year}년 · {p.programCode}</span>
        </div>
      </div>

      {p.description && (
        <p className="rounded-lg bg-subtle p-3 text-[12px] leading-relaxed text-muted-foreground">{p.description}</p>
      )}

      <div className="space-y-1.5 text-[12px]">
        <Row icon={<Landmark className="h-3.5 w-3.5" />} label="부처" value={p.ministry ?? "—"} />
        <Row icon={<Building2 className="h-3.5 w-3.5" />} label="지자체" value={p.localGov ?? "—"} />
        <Row
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="사업기간"
          value={p.startDate && p.endDate ? `${p.startDate} ~ ${p.endDate}` : "—"}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="신청 기업" value={noRecord ? "—" : `${p.applicantCount}개`} />
        <StatCard
          label="선정 기업"
          value={noRecord ? "—" : `${p.selectedCount}개`}
          sub={!noRecord && p.selectedCount === 0 ? "전원 탈락/포기" : undefined}
        />
        <StatCard
          label="총 지원금"
          value={noRecord || p.selectedCount === 0 ? "—" : formatKRW(p.totalAmountThousand)}
          sub={missing > 0 ? `${missing}건 미기재` : undefined}
        />
      </div>

      {p.detailItems.length > 0 && (
        <Section title="세부 품목">
          <div className="flex flex-wrap gap-1.5">
            {p.detailItems.map((d) => (
              <Badge key={d} variant="secondary" className="text-[11px]">{d}</Badge>
            ))}
          </div>
        </Section>
      )}

      {selected.length > 0 && (
        <Section title={`선정 기업 ${selected.length}개`}>
          <div className="space-y-1">
            {selected.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/companies/${c.id}`)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <span className="truncate text-[12.5px] font-medium">{c.name}</span>
                <span className="shrink-0 truncate text-[11px] text-muted-foreground">{c.industry ?? "업종 미상"}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {repeat.companyCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2.5 text-[hsl(30_75%_38%)]">
          <Repeat className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold">
              동일 사업 반복 수혜 {repeat.companyCount}개사
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
              선정 {selected.length}개사 중 {repeat.companyCount}개사가 {repeat.years.join("·")}년에도 이 사업에 선정됐습니다.
            </p>
          </div>
        </div>
      )}

      {coSupported.length > 0 && (
        <Section title="함께 받은 다른 사업">
          <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
            이 사업 선정 기업이 다른 사업에서도 선정된 내역입니다. 같은 기업 풀이 반복되면 중복 수혜 검토가 필요합니다.
          </p>
          {visibleCo.length === 0 ? (
            <p className="rounded-lg bg-subtle px-3 py-2.5 text-[11.5px] text-muted-foreground">
              {threshold}개사 이상 겹치는 사업이 없습니다 — 기업 풀 반복 신호 약함.
            </p>
          ) : (
            <div className="space-y-1">
              {visibleCo.map((co) => (
                <div
                  key={co.name}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="min-w-0 text-[12px]">
                    <span className="block truncate">{co.name}</span>
                    <span className="text-[10.5px] tabular-nums text-muted-foreground">{co.years.join("·")}</span>
                  </span>
                  <span
                    className={`shrink-0 text-[11.5px] font-medium tabular-nums ${
                      co.overlapCount >= threshold ? "" : "text-muted-foreground"
                    }`}
                  >
                    {co.overlapCount}개사
                  </span>
                </div>
              ))}
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
          이 사업에 매칭된 신청 기록이 없습니다. 보유 데이터에 해당 사업의 기업 지원 내역이 포함되지 않은 경우입니다.
        </p>
      )}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12.5px] font-bold">{title}</p>
      {children}
    </div>
  );
}
