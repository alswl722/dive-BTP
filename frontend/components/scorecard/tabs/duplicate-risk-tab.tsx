"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatKRW } from "@/lib/utils";
import type { Company } from "@/types";
import {
  DUPLICATE_RISK_THRESHOLD,
  recentSelectionCount,
  recordYear,
  riskLevel,
  RISK_LEVEL_BADGE,
  selectionsByYear,
} from "@/lib/duplicate-risk";
import { deptKey, findConcurrentPairs, summarizeConcurrent } from "@/lib/concurrent-support";
import { DuplicateFlagDetailPanel } from "@/components/axis9/DuplicateFlagBadge";
import { AxisSignals } from "@/components/scorecard/axis-signals";

const resultVariant = { 선정: "good", 탈락: "bad", 포기: "secondary" } as const;

export function DuplicateRiskTab({ company, latestYear }: { company: Company; latestYear: number }) {
  const count = recentSelectionCount(company, latestYear);
  const level = riskLevel(count);
  const byYear = selectionsByYear(company, latestYear);
  const from = latestYear - byYear.length + 1;
  const recentSelections = company.supportHistory.filter(
    (h) => h.result === "선정" && recordYear(h) >= from && recordYear(h) <= latestYear
  );

  // 동시 수혜(기간 겹침) — 원래 "지원이력" 탭에 있던 축을 중복수혜로 통합.
  // 반복(해마다 뽑히나)과는 다른 문제이지만 담당자에겐 "중복 위험" 한 축에서 함께 보는 게 더 명료.
  const concurrent = summarizeConcurrent(company);
  const crossDeptSameTypePairs = findConcurrentPairs(company).filter((p) => p.crossDept && p.sameType);

  return (
    <div className="space-y-5">
      <AxisSignals company={company} latestYear={latestYear} axis="중복수혜" />

      {/* 축9 상세 판정 (성장률 교차 truth table + 세그먼트 + 성장 근거 카드) */}
      <DuplicateFlagDetailPanel flag={company.duplicateFlag} />

      {/* 동시 수행 지원 (기간 겹침) — flag 판정의 부가 근거 성격 */}
      <ConcurrentPanel summary={concurrent} pairs={crossDeptSameTypePairs} />

      <div className="border-t pt-4" />

      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold">
          최근 {byYear.length}개년 선정 분석 <span className="font-normal text-muted-foreground">({from}~{latestYear})</span>
        </p>
        <Badge variant={RISK_LEVEL_BADGE[level]} className="text-[12px]">
          중복 위험도: {level}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {byYear.map(({ year, count }) => (
          <div key={year} className="rounded-lg bg-subtle py-4 text-center">
            <p className="text-[12px] text-muted-foreground">{year}년</p>
            <p className="mt-1 text-[22px] font-extrabold tabular-nums">{count}</p>
            <p className="text-[11px] text-muted-foreground">선정</p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-[12.5px] font-bold">
          {byYear.length}년간 선정 합계: <span className="text-primary">{count}건</span>
        </p>
        {recentSelections.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">해당 기간 선정 내역이 없습니다.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {recentSelections.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-3.5 py-2.5 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 shrink-0 text-good" />
                  <span className="tabular-nums text-muted-foreground">{r.date}</span>
                  <span>{r.bizType}</span>
                </div>
                {r.amount > 0 && <span className="tabular-nums text-[11px] text-muted-foreground">{formatKRW(r.amount)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {count >= DUPLICATE_RISK_THRESHOLD && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3.5 py-3 text-[12px] text-[hsl(30_75%_38%)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            최근 {byYear.length}년 내 {count}회 선정됨. 중복수혜 가이드라인 검토 필요.
          </p>
        </div>
      )}

      {/* 전체 지원이력 (기본 접힘) — flag/중복위험 판정 근거를 담당자가 원본 시간축으로
          확인하고 싶을 때 열어보는 상세. 최근 3년 요약(위)과 겹치지 않도록 기본 닫힘. */}
      <FullHistoryDisclosure company={company} />
    </div>
  );
}

/**
 * 동시 수혜 패널 — "지금 다른 부서에서 받고 있나".
 * 반복 수혜(해마다 뽑히나)와 다른 문제. 부서별로 따로 심사하는 구조상 담당자가
 * 못 보던 지점이라, 기간이 겹치는 건을 사업군·지원 성격까지 대조해 보여준다.
 */
function ConcurrentPanel({
  summary,
  pairs,
}: {
  summary: ReturnType<typeof summarizeConcurrent>;
  pairs: ReturnType<typeof findConcurrentPairs>;
}) {
  if (summary.total === 0 && summary.missingPeriod === 0) return null;

  return (
    <div className="space-y-2">
      {summary.total > 0 && (
        <div className="rounded-lg border p-3.5">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-[12.5px] font-bold">동시 수행 지원</p>
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            수행 기간이 겹치는 건 <b className="text-foreground">{summary.total}쌍</b>
            {summary.crossDept > 0 && <> · 그중 다른 사업군 <b className="text-foreground">{summary.crossDept}쌍</b></>}
            {summary.crossDeptSameType > 0 && <> · 같은 성격 <b className="text-bad">{summary.crossDeptSameType}쌍</b></>}
          </p>
          {summary.deptUnknown > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              ※ {summary.deptUnknown}쌍은 연도가 달라 사업군을 비교할 수 없습니다(2024년 사업코드 체계 개편).
            </p>
          )}
        </div>
      )}

      {pairs.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-bad-bg px-3.5 py-3 text-[12px] text-bad">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold">같은 성격의 지원을 다른 사업군에서 동시 수령</p>
            <ul className="mt-1 space-y-0.5 text-[11.5px] opacity-90">
              {pairs.slice(0, 4).map((p, i) => (
                <li key={i}>
                  {p.a.bizType} — [{deptKey(p.a.programCode)}] {p.a.programCode} + [{deptKey(p.b.programCode)}] {p.b.programCode}
                </li>
              ))}
              {pairs.length > 4 && <li>외 {pairs.length - 4}건</li>}
            </ul>
          </div>
        </div>
      )}

      {summary.missingPeriod > 0 && (
        <p className="text-[11px] text-muted-foreground">
          ※ 수행 기간이 없는 선정 건 {summary.missingPeriod}건은 판정에서 제외됐습니다(과소 판정 가능).
        </p>
      )}
    </div>
  );
}

/**
 * 전체 지원이력 접힘형 — 시간축 원본 확인용. 옛 지원이력 탭의 통계 3카드 +
 * 타임라인을 여기 접어 넣었다. 기본은 닫힘(위의 최근 3년 요약과 정보 중복 방지).
 */
function FullHistoryDisclosure({ company }: { company: Company }) {
  const [open, setOpen] = useState(false);
  const h = company.supportHistory;

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-[12.5px] font-medium hover:bg-muted/50"
        aria-expanded={open}
      >
        <span>전체 지원이력 ({h.length}건)</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t px-3.5 py-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-subtle p-3 text-center">
              <p className="text-[10.5px] text-muted-foreground">총 지원건수</p>
              <p className="mt-0.5 text-[17px] font-extrabold tabular-nums">{company.support.건수 ?? 0}건</p>
            </div>
            <div className="rounded-lg bg-subtle p-3 text-center">
              <p className="text-[10.5px] text-muted-foreground">총 지원금</p>
              <p className="mt-0.5 text-[17px] font-extrabold tabular-nums">{formatKRW(company.support.총지원금_천원)}</p>
            </div>
            <div className="rounded-lg bg-subtle p-3 text-center">
              <p className="text-[10.5px] text-muted-foreground">지원 연도수</p>
              <p className="mt-0.5 text-[17px] font-extrabold tabular-nums">{company.support.지원연도수 ?? 0}개년</p>
            </div>
          </div>

          {h.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-muted-foreground">지원 이력이 없습니다.</p>
          ) : (
            <ol className="relative space-y-3 border-l pl-4">
              {h.map((r, i) => (
                <li key={i} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                      r.result === "선정" ? "bg-good" : r.result === "탈락" ? "bg-bad" : "bg-muted-foreground"
                    )}
                  />
                  <div className="flex items-center justify-between gap-2 text-[12.5px]">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">{r.date}</span>
                      <span className="truncate">{r.bizType}</span>
                      {deptKey(r.programCode) && (
                        <span
                          className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                          title={`사업코드 ${r.programCode} — 접두사로 추정한 사업군`}
                        >
                          {deptKey(r.programCode)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {r.amount > 0 && <span className="tabular-nums text-[11px] text-muted-foreground">{formatKRW(r.amount)}</span>}
                      <Badge variant={resultVariant[r.result]}>{r.result}</Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
