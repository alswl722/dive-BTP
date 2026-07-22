"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Axis, Company, CompositeGroup, ReviewStatus } from "@/types";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { AxisMiniBars } from "@/components/companies/axis-mini-bars";
import { FavoriteToggle } from "@/components/companies/favorite-toggle";
import { resolveOverallScore, techGroupScore, DEFAULT_TECH_WEIGHTS, type TechAxis } from "@/lib/scoring";
import { deriveRiskGrade, deriveReviewSignals, type RiskAssessment, type Severity } from "@/lib/review-summary";
import { useUi } from "@/lib/app-state";
import { cn } from "@/lib/utils";
import { MAX_COMPARE, type SortDir, type SortKey } from "@/lib/company-filters";

/** 심사 상태 → 뱃지 색. 컬럼을 없애고 기업명 옆에 붙이면서 한 곳으로 모았다. */
const STATUS_VARIANT: Record<ReviewStatus, "good" | "bad" | "secondary"> = {
  선정: "good",
  제외: "bad",
  후보: "secondary",
};

/** 건전성 등급 톤 → 뱃지 색. muted(휴폐업)는 secondary로. */
const RISK_VARIANT: Record<RiskAssessment["tone"], "good" | "warn" | "bad" | "secondary"> = {
  good: "good",
  warn: "warn",
  bad: "bad",
  muted: "secondary",
};

export function CompaniesTable({
  companies,
  weights,
  groupWeights,
  techWeights = DEFAULT_TECH_WEIGHTS,
  latestYear,
  selectedIds,
  onToggleSelect,
  compareDisabled = false,
  onOpenDetail,
  openId,
  sortKey,
  sortDir,
  onSort,
}: {
  companies: Company[];
  weights: Record<Axis, number>;
  groupWeights: Record<CompositeGroup, number>;
  techWeights?: Record<TechAxis, number>;
  latestYear: number;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  compareDisabled?: boolean; // 사업 미선택 — 비교 체크박스 전체 비활성화
  onOpenDetail: (id: number) => void;
  openId: number | null;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const { pageSize } = useUi();
  const [page, setPage] = useState(0);
  // 건전성 배지 hover 상세 툴팁 — 테이블이 overflow-x-auto라 셀 안 절대배치는 잘린다.
  // 뷰포트 기준 fixed로 띄워 클리핑을 회피(배지 위치를 hover 시 측정).
  const [tip, setTip] = useState<{ company: Company; x: number; y: number } | null>(null);
  // companies는 부모에서 필터/정렬/가중치 변경마다 새 배열로 memo되므로, 내용이나 순서가 바뀌면
  // (예: 가중치 조정으로 재정렬만 되고 길이는 그대로인 경우도) 여기서 항상 1페이지로 리셋된다.
  useEffect(() => setPage(0), [companies, pageSize]);

  const totalPages = Math.max(1, Math.ceil(companies.length / pageSize));
  const pageItems = companies.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-3">
      <Table>
        <THead>
          <TR>
            <TH className="w-8"></TH>
            {/* 폭 명시 — 자동 배분 시 이 열이 남는 공간을 다 흡수해 최근매출과 사이가 벌어지던 문제 해소 */}
            <TH className="w-[260px]">기업 · 업종</TH>
            <TH className="w-[92px] text-center">건전성</TH>
            <SortableTH label="종합점수" active={sortKey === "overall"} dir={sortDir} onClick={() => onSort("overall")} />
            <TH className="w-[172px]">4축 점수</TH>
            <SortableTH label="기술 점수" active={sortKey === "techScore"} dir={sortDir} onClick={() => onSort("techScore")} />
            <SortableTH label="지원건수" active={sortKey === "supportCount"} dir={sortDir} onClick={() => onSort("supportCount")} />
          </TR>
        </THead>
        <TBody>
          {pageItems.map((c) => {
            const status = c.reviewStatus;
            return (
              <TR
                key={c.id}
                onClick={() => onOpenDetail(c.id)}
                className={cn("cursor-pointer", openId === c.id && "bg-info-bg/40")}
              >
                <TD onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    disabled={compareDisabled || (!selectedIds.has(c.id) && selectedIds.size >= MAX_COMPARE)}
                    onChange={() => onToggleSelect(c.id)}
                    title={compareDisabled ? "사업을 선택하면 비교할 수 있습니다" : undefined}
                    className="h-3.5 w-3.5 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </TD>
                <TD>
                  {/* 상태는 별도 컬럼 대신 기업명 옆 뱃지로 — 기본값 '후보'는 노이즈라 숨기고 선정/제외만 표시 */}
                  <p className="flex items-center gap-1.5 font-medium">
                    <FavoriteToggle companyId={c.id} />
                    <span className="truncate">{c.name}</span>
                    {status !== "후보" && (
                      <Badge variant={STATUS_VARIANT[status]} className="shrink-0 px-1.5 py-0 text-[10px]">
                        {status}
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground" title={c.industry ?? undefined}>
                    {c.industry ?? "-"}
                  </p>
                </TD>
                <TD className="text-center">
                  {/* 건전성 등급 — 위험 신호 롤업. 점수 컬럼이 못 잡는 '위험' 차원을 트리아지용으로.
                      hover 시 상세 이유(신호별 제목·설명) 툴팁. */}
                  {(() => {
                    const risk = deriveRiskGrade(c, latestYear);
                    return (
                      <span
                        onMouseEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setTip({ company: c, x: r.left + r.width / 2, y: r.bottom + 6 });
                        }}
                        onMouseLeave={() => setTip(null)}
                      >
                        <Badge variant={RISK_VARIANT[risk.tone]} className="cursor-help px-1.5 py-0 text-[10px]">
                          {risk.grade}
                        </Badge>
                      </span>
                    );
                  })()}
                </TD>
                <TD>
                  <ScoreBadge score={resolveOverallScore(c, groupWeights, weights, techWeights)} size="sm" />
                </TD>
                <TD>
                  <AxisMiniBars scores={c.scores} />
                </TD>
                <TD>
                  {/* 기술 그룹 점수(R&D특허+NTIS). 데이터 없는 기업은 0이 아니라 '-' */}
                  <ScoreBadge score={techGroupScore(c, techWeights)} size="sm" />
                </TD>
                <TD className="tabular-nums">{c.support.건수 ?? 0}건</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      {tip && <RiskTooltip company={tip.company} latestYear={latestYear} x={tip.x} y={tip.y} />}

      {pageItems.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Info className="h-4 w-4" /> 조건에 맞는 기업이 없습니다.
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function SortableTH({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <TH>
      <button onClick={onClick} className={cn("inline-flex items-center gap-0.5", active && "text-primary")}>
        {label}
        {active && (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    </TH>
  );
}

const SEV_DOT: Record<Severity, string> = { 위험: "text-bad", 주의: "text-[hsl(30_75%_38%)]", 정보: "text-muted-foreground" };

/**
 * 건전성 상세 툴팁 — 등급의 근거가 된 위험·주의 신호를 제목+설명까지 보여준다.
 * 뷰포트 기준 fixed 배치라 테이블 overflow에 안 잘린다. 좌우 끝에서 화면 밖으로
 * 나가지 않게 left를 클램프.
 */
function RiskTooltip({ company, latestYear, x, y }: { company: Company; latestYear: number; x: number; y: number }) {
  const risk = deriveRiskGrade(company, latestYear);
  // 등급 근거 신호(위험·주의)를 제목+설명까지. 휴폐업은 신호가 아니라 별도 처리.
  const signals = deriveReviewSignals(company, latestYear).filter((s) => s.sev === "위험" || s.sev === "주의");
  const W = 300;
  const left = Math.min(Math.max(x - W / 2, 8), (typeof window !== "undefined" ? window.innerWidth : 1200) - W - 8);

  return (
    <div
      style={{ position: "fixed", top: y, left, width: W }}
      className="pointer-events-none z-50 rounded-lg border bg-card p-3 shadow-modal"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {risk.tone === "good" ? (
          <ShieldCheck className="h-3.5 w-3.5 text-good" />
        ) : (
          <ShieldAlert className={cn("h-3.5 w-3.5", risk.tone === "bad" ? "text-bad" : risk.tone === "warn" ? "text-[hsl(30_75%_38%)]" : "text-muted-foreground")} />
        )}
        <span className="text-[12.5px] font-bold">건전성 {risk.grade}</span>
        {risk.counts.위험 + risk.counts.주의 > 0 && (
          <span className="text-[11px] text-muted-foreground">
            (위험 {risk.counts.위험} · 주의 {risk.counts.주의})
          </span>
        )}
      </div>

      {risk.grade === "휴폐업" ? (
        <p className="text-[11.5px] text-muted-foreground">{company.closureType ?? "휴·폐업 상태"} — 지원 대상에서 제외 대상</p>
      ) : signals.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground">확인된 위험·주의 신호가 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {signals.map((sig, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle className={cn("mt-0.5 h-3 w-3 shrink-0", SEV_DOT[sig.sev])} />
              <span className="min-w-0">
                <span className="text-[11.5px] font-medium">{sig.title}</span>
                <span className="ml-1 text-[10.5px] text-muted-foreground">· {sig.axis}</span>
                {sig.detail && <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{sig.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
