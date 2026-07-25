"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatKRW } from "@/lib/utils";
import type { Company } from "@/types";
import {
  DUPLICATE_RISK_THRESHOLD,
  groupBySelection,
  recentSelectionCount,
  riskLevel,
  RISK_LEVEL_BADGE,
  selectionsByYear,
} from "@/lib/duplicate-risk";
import { deptKey, findConcurrentPairs, summarizeConcurrent } from "@/lib/concurrent-support";
import { DuplicateFlagDetailPanel } from "@/components/axis9/DuplicateFlagBadge";

const resultVariant = { 선정: "good", 탈락: "bad", 포기: "secondary" } as const;

export function DuplicateRiskTab({ company, latestYear }: { company: Company; latestYear: number }) {
  const count = recentSelectionCount(company, latestYear);
  const level = riskLevel(count);
  const byYear = selectionsByYear(company, latestYear);
  const from = latestYear - byYear.length + 1;

  // 동시 수혜(기간 겹침) — 원래 "지원이력" 탭에 있던 축을 중복수혜로 통합.
  // 반복(해마다 뽑히나)과는 다른 문제이지만 담당자에겐 "중복 위험" 한 축에서 함께 보는 게 더 명료.
  const concurrent = summarizeConcurrent(company);
  const crossDeptSameTypePairs = findConcurrentPairs(company).filter((p) => p.crossDept && p.sameType);

  return (
    <div className="space-y-5">
      {/* 축9 상세 판정 (성장률 교차 truth table + 세그먼트 + 성장 근거 카드).
          이 탭은 다른 탭과 달리 AxisSignals(요약 문장)를 쓰지 않는다 — 아래
          flag 판정·동시수혜 패널·연도별 카드가 이미 같은 내용을 근거와 함께
          보여주므로, 요약 문장을 더 얹으면 같은 정보가 두 번 반복된다. */}
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
                  {p.a.bizType} — {p.a.programName ?? p.a.programCode} + {p.b.programName ?? p.b.programCode}
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
  // 목록·건수 모두 사업(선정) 단위 — 행 수를 쓰면 패키지 세부품목이 각각 1건으로 잡힌다.
  const groups = groupBySelection(h);

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-[12.5px] font-medium hover:bg-muted/50"
        aria-expanded={open}
      >
        <span>
          전체 지원이력 ({groups.length}건
          {h.length !== groups.length && <span className="font-normal text-muted-foreground"> · 세부품목 {h.length}개</span>})
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t px-3.5 py-3">
          <div className="grid grid-cols-3 gap-3">
            {/* 아래 목록과 같은 기준(사업 단위)으로 센다 — 카드 숫자와 목록 개수가
                어긋나면 담당자가 어느 쪽을 믿어야 할지 알 수 없다.
                company.support.선정건수는 '선정'만 세므로(반복선정 랭킹용) 여기 쓰지 않는다
                — 이 목록은 탈락·포기까지 포함한 전체 이력이다. */}
            <div className="rounded-lg bg-subtle p-3 text-center">
              <p className="text-[10.5px] text-muted-foreground">총 지원건수</p>
              <p className="mt-0.5 text-[17px] font-extrabold tabular-nums">{groups.length}건</p>
              {h.length !== groups.length && (
                <p className="text-[10px] text-muted-foreground">세부품목 {h.length}개</p>
              )}
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

          {/* 날짜(선정일·시작일)가 둘 다 없는 행은 타임라인에 위치를 못 잡아 supportHistory에서
              빠진다(원본 결측 그대로, 임의 날짜 대체 안 함). 그래도 선정건수·총지원금에는
              포함되므로, 아래 목록이 전부가 아니라는 사실을 반드시 표기한다
              — 목록만 보고 "이게 전부"라고 판단하면 큰 금액 건을 통째로 놓칠 수 있다
              (1178: C3_1_2 176,000천원이 날짜 결측). */}
          {(company.support.건수 ?? 0) > h.length && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                지원항목 {(company.support.건수 ?? 0) - h.length}개는 선정일·시작일이 없어 아래 타임라인에서 제외됐습니다.
                총 지원금에는 포함돼 있습니다.
              </span>
            </p>
          )}

          {h.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-muted-foreground">지원 이력이 없습니다.</p>
          ) : (
            /* 사업(선정) 단위로 묶어 표시 — 행을 그대로 나열하면 패키지 1건이 여러 줄로
               흩어져 위의 "N건 선정"과 목록 개수가 어긋난다. 세부품목은 그룹 안에 접어 넣어
               "무엇을 얼마씩" 받았는지는 그대로 볼 수 있게 한다. */
            <ol className="relative space-y-3 border-l pl-4">
              {groups.map((g) => (
                <li key={g.key} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                      g.result === "선정" ? "bg-good" : g.result === "탈락" ? "bg-bad" : "bg-muted-foreground"
                    )}
                  />
                  <div className="flex items-center justify-between gap-2 text-[12.5px]">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 tabular-nums text-muted-foreground">{g.date}</span>
                      <span className="truncate font-medium">{g.programName ?? g.programCode ?? g.bizType}</span>
                      {deptKey(g.programCode) && (
                        <span
                          className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                          title={`사업코드 ${g.programCode} — 접두사로 추정한 사업군`}
                        >
                          {deptKey(g.programCode)}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {g.totalAmount > 0 && (
                        <span className="tabular-nums text-[11px] font-medium">{formatKRW(g.totalAmount)}</span>
                      )}
                      <Badge variant={resultVariant[g.result]}>{g.result}</Badge>
                    </div>
                  </div>

                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {g.bizType}
                    {g.items.length > 1 && <> · 세부품목 {g.items.length}개</>}
                  </p>

                  {/* 세부품목 내역 — 패키지처럼 여러 품목을 받은 경우에만 펼쳐 보여준다.
                      단일 품목이면 위 금액과 같은 값이 반복되므로 생략. */}
                  {g.items.length > 1 && (
                    <ul className="mt-1.5 space-y-1 rounded-md bg-subtle px-2.5 py-2">
                      {g.items.map((it, j) => {
                        const label = [it.supportDetailMain, it.supportDetailOther]
                          .filter((d): d is string => !!d)
                          .join(" · ");
                        return (
                          <li key={j} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="min-w-0 truncate text-muted-foreground">
                              {label || it.supportItem || "품목 미상"}
                            </span>
                            {it.amount > 0 && (
                              <span className="shrink-0 tabular-nums text-muted-foreground">{formatKRW(it.amount)}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
