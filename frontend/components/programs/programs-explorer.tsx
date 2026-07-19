"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { Program } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { businessTypeLabel, programStatus, PROGRAM_STATUS_BADGE } from "@/lib/program-status";
import { formatKRW, cn } from "@/lib/utils";

const PAGE_SIZE = 15;

export function ProgramsExplorer({ programs, referenceDateIso }: { programs: Program[]; referenceDateIso: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referenceDate = useMemo(() => new Date(referenceDateIso + "T00:00:00"), [referenceDateIso]);

  const [year, setYear] = useState<string>(searchParams.get("year") ?? "전체");
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // /programs에 머무른 채 연도만 다른 링크(대시보드 "마감 임박 사업" 등)를 다시 누르면
  // 컴포넌트가 리마운트되지 않아 위 useState 초기값이 재실행되지 않는다 — 매번 동기화.
  useEffect(() => {
    setYear(searchParams.get("year") ?? "전체");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const years = useMemo(() => Array.from(new Set(programs.map((p) => p.year))).sort((a, b) => b - a), [programs]);

  const businessTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of programs) {
      const key = p.businessType ?? "미분류";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [programs]);

  const detailOptions = useMemo(() => {
    const pool = businessType ? programs.filter((p) => (p.businessType ?? "미분류") === businessType) : programs;
    return Array.from(new Set(pool.flatMap((p) => p.detailItems))).sort();
  }, [programs, businessType]);

  const filtered = useMemo(() => {
    return programs.filter((p) => {
      if (year !== "전체" && String(p.year) !== year) return false;
      if (businessType && (p.businessType ?? "미분류") !== businessType) return false;
      if (detailItem && !p.detailItems.includes(detailItem)) return false;
      return true;
    });
  }, [programs, year, businessType, detailItem]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function updateFilter(fn: () => void) {
    fn();
    setPage(0);
  }

  return (
    <div className="space-y-4">
      {/* flex-nowrap 고정 — 사업유형이 많아도 줄바꿈 대신 그 그룹만 가로 스크롤한다 */}
      <Card className="flex flex-nowrap items-center gap-2 p-2.5">
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-1">
          {["전체", ...years.map(String)].map((y) => (
            <SegmentButton key={y} active={year === y} onClick={() => updateFilter(() => setYear(y))}>
              {y === "전체" ? "전체" : `${y}년`}
            </SegmentButton>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-1">
          <SegmentButton active={businessType === null} onClick={() => updateFilter(() => { setBusinessType(null); setDetailItem(null); })}>
            전체
          </SegmentButton>
          {businessTypes.map(([bt]) => (
            <SegmentButton
              key={bt}
              active={businessType === bt}
              onClick={() => updateFilter(() => { setBusinessType(bt); setDetailItem(null); })}
            >
              {businessTypeLabel(bt === "미분류" ? null : bt)}
            </SegmentButton>
          ))}
        </div>

        <select
          value={detailItem ?? ""}
          onChange={(e) => updateFilter(() => setDetailItem(e.target.value || null))}
          className="shrink-0 rounded-md border bg-subtle px-2 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-ring/40"
        >
          <option value="">지원구분 전체</option>
          {detailOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Card>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>사업명</TH>
              <TH>사업유형</TH>
              <TH>세부 품목</TH>
              <TH className="text-center">상태</TH>
              <TH className="text-center">선정 기업 수</TH>
              <TH className="text-center">총 지원금</TH>
              <TH className="text-center">연도</TH>
              <TH className="text-center">신청기업</TH>
            </TR>
          </THead>
          <TBody>
            {pageItems.map((p) => {
              const status = programStatus(p, referenceDate);
              return (
                <TR
                  key={`${p.year}:${p.programCode}`}
                  className="cursor-pointer"
                  onClick={() => router.push(`/companies?program=${p.year}:${p.programCode}`)}
                >
                  <TD>
                    <p className="font-medium">{p.name ?? p.programCode}</p>
                    <p className="text-xs text-muted-foreground">신청기업 {p.applicantCount}개</p>
                  </TD>
                  <TD>
                    <Badge variant="info">{businessTypeLabel(p.businessType)}</Badge>
                  </TD>
                  <TD className="text-muted-foreground">{p.detailItems.slice(0, 2).join(", ") || "—"}</TD>
                  <TD className="text-center">
                    <Badge variant={PROGRAM_STATUS_BADGE[status]}>{status}</Badge>
                  </TD>
                  <TD className="text-center tabular-nums">{p.selectedCount}</TD>
                  <TD className="text-center tabular-nums">{formatKRW(p.totalAmountThousand)}</TD>
                  <TD className="text-center tabular-nums text-muted-foreground">{p.year}</TD>
                  <TD className="text-center">
                    {/* 행 클릭 = 이 사업의 신청기업 목록으로 이동. 화살표만 두면 뜻이 안 보여 라벨을 붙인다. */}
                    <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11.5px] text-muted-foreground">
                      목록 보기
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {pageItems.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">조건에 맞는 사업이 없습니다.</p>
        )}
      </Card>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function SegmentButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium transition-colors",
        active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
