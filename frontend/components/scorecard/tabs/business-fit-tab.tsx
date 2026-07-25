"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AxisSignals } from "@/components/scorecard/axis-signals";
import { Selectable } from "@/lib/report-select";
import { cn } from "@/lib/utils";
import type { Company, MatchType, AlignmentJudgment } from "@/types";

const MATCH_STYLE: Record<MatchType, { badge: "good" | "info" | "warn" | "bad" | "slate"; dot: string; text: string }> = {
  직접일치: { badge: "good", dot: "bg-good", text: "text-good" },
  간접관련: { badge: "info", dot: "bg-info", text: "text-info" },
  무관: { badge: "warn", dot: "bg-warn", text: "text-warn" },
  판단유보: { badge: "slate", dot: "bg-slate-400", text: "text-slate-500" },
};

// 확인이 시급한 매치타입 — 우측에 "확인 필요" 배지만 붙이고 열림은 사용자 조작에 맡긴다
// (기본값은 전부 접힘: 초기 스크롤 길이 최소화).
const URGENT_TYPES: MatchType[] = ["무관", "판단유보"];

export function BusinessFitTab({ company, latestYear }: { company: Company; latestYear: number }) {
  const fit = company.businessFit;
  const hasSupportHistory = (company.supportHistory ?? []).length > 0;

  if (!fit) {
    return (
      <div className="rounded-lg bg-subtle p-6 text-center text-[13px] text-muted-foreground">
        {hasSupportHistory
          ? "판정 데이터 없음 (백엔드 미연결 또는 fixture 미갱신)"
          : "받은 지원이력 없음 — 정합성 판정 대상 없음"}
      </div>
    );
  }

  // 매치타입별 그룹핑
  const grouped: Record<MatchType, AlignmentJudgment[]> = {
    직접일치: [], 간접관련: [], 무관: [], 판단유보: [],
  };
  for (const j of fit.judgments) grouped[j.matchType].push(j);

  const total = fit.totalJudged + fit.totalPending;

  return (
    <div className="space-y-5">
      <AxisSignals company={company} latestYear={latestYear} axis="사업정체성" />

      {/* 종합 판정 — 다른 탭(중복수혜의 DuplicateFlagDetailPanel)과 동일한 톤: 일반 border 카드.
          이전엔 파란 gradient bg 를 써서 사업정체성 탭만 시각적으로 튀었다. */}
      <Selectable id="bf-summary">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[16px] leading-none" role="img" aria-label="AI">🤖</span>
              <p className="text-[13px] font-bold">종합 판정</p>
              <Badge variant="slate" className="text-[10px]">AI 판정</Badge>
            </div>
            {fit.score !== null && (
              <div className="flex items-baseline gap-2 rounded-lg border bg-card px-3.5 py-2">
                <span className="text-[12.5px] text-muted-foreground">정합성</span>
                <span className="text-[24px] font-extrabold tabular-nums leading-none">
                  {fit.score.toFixed(0)}
                  <span className="text-[13px] font-normal text-muted-foreground ml-0.5">/100</span>
                </span>
              </div>
            )}
          </div>

          {/* 매치타입별 카운트 — 4카드 그리드 (다른 탭 StatCard 톤과 일치)
              이전엔 위에 fit.summary 문장("20건 정합성 판정: 직접일치 18건, …")도 있었지만
              바로 아래 4카운트 카드와 정보가 완전 중복이라 제거. */}
          <div className="grid grid-cols-4 gap-3">
            {(["직접일치", "간접관련", "무관", "판단유보"] as MatchType[]).map((mt) => {
              const count = fit.breakdown[mt] ?? 0;
              const pct = total > 0 ? (count / total * 100) : 0;
              const s = MATCH_STYLE[mt];
              return (
                <div key={mt} className="rounded-lg bg-subtle p-3 text-center">
                  <div className={cn("mx-auto mb-1 h-2 w-2 rounded-full", s.dot)} />
                  <p className={cn("text-[10.5px] font-medium", s.text)}>{mt}</p>
                  <p className="text-[19px] font-extrabold tabular-nums mt-0.5">{count}</p>
                  <p className="text-[10px] text-muted-foreground">{pct.toFixed(0)}%</p>
                </div>
              );
            })}
          </div>
        </div>
      </Selectable>

      {/* 판정 대기 알림 — 정보성 카드는 제거했지만 액션 필요 케이스는 유지 */}
      {fit.totalPending > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3.5 py-3 text-[12.5px] text-[hsl(30_75%_38%)]">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {fit.totalPending}건은 whitelist 미통과 케이스로 LLM 시맨틱 판정 대기 중.
            <code className="mx-1 px-1 rounded bg-white text-[11px]">python scripts/run_axis8_llm_batch.py</code>
            실행 시 확정됩니다.
          </p>
        </div>
      )}

      {/* 판정 상세 — 매치타입별 접힘. 확인이 시급한 것(무관·판단유보)만 기본 펼침.
          이전엔 전 판정을 다 펼쳐 놓아 탭이 세로로 크게 늘어졌었다(20건 × 각 3~4줄). */}
      <Selectable id="bf-detail">
        <div>
          <p className="mb-1 text-[12.5px] font-bold">판정 상세</p>
          <div className="rounded-lg border bg-card">
            {(["무관", "판단유보", "간접관련", "직접일치"] as MatchType[]).map((mt) => {
              const items = grouped[mt];
              if (items.length === 0) return null;
              return <MatchTypeGroup key={mt} matchType={mt} items={items} />;
            })}
          </div>
        </div>
      </Selectable>
    </div>
  );
}

/** 매치타입별 그룹 헤더(접힘형) — 재무 탭의 축별 세부지표 DrillDownRow 와 같은 톤.
 *  기본 닫힘 — 4개 그룹이 다 열려 있으면 탭이 세로로 늘어난다. 담당자가 관심 있는 것만 편다. */
function MatchTypeGroup({
  matchType, items,
}: { matchType: MatchType; items: AlignmentJudgment[] }) {
  const [open, setOpen] = useState(false);
  const s = MATCH_STYLE[matchType];
  const urgent = URGENT_TYPES.includes(matchType);

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted/40"
      >
        <span className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} />
          <span className="text-[12.5px] font-bold">{matchType}</span>
          <span className="text-[11px] text-muted-foreground">{items.length}건</span>
          {urgent && (
            <Badge variant={s.badge} className="text-[10px]">
              <AlertTriangle className="mr-0.5 h-3 w-3" />
              확인 필요
            </Badge>
          )}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="divide-y border-t">
          {items.map((j, i) => (
            <JudgmentRow key={i} judgment={j} />
          ))}
        </div>
      )}
    </div>
  );
}

function JudgmentRow({ judgment: j }: { judgment: AlignmentJudgment }) {
  const s = MATCH_STYLE[j.matchType];
  return (
    <div className="p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground mb-1">
            <span className="tabular-nums font-medium">{j.year}</span>
            <span>·</span>
            <span>{j.businessType || "-"}</span>
            <span>·</span>
            <span className="uppercase text-[10px] tracking-wider">
              {j.source === "whitelist" && "규칙 확정"}
              {j.source === "llm" && "🤖 AI 판정"}
              {j.source === "pending" && "판정 대기"}
            </span>
          </div>
          <p className="text-[13px] font-semibold truncate">
            {j.programName || j.programCode}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={s.badge} className="text-[10px]">
            {j.matchType}
          </Badge>
          {j.score !== null && (
            <span className="text-[11.5px] tabular-nums text-muted-foreground font-medium">
              {j.score.toFixed(0)}점
            </span>
          )}
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground leading-relaxed pl-0.5">
        {j.source === "whitelist" && <Check className="inline h-3 w-3 mr-1 text-good" />}
        {j.source === "pending" && <Clock className="inline h-3 w-3 mr-1 text-muted-foreground" />}
        {j.reasoning}
      </p>
      {j.matchedKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-0.5">
          {j.matchedKeywords.map((k, ki) => (
            <span key={ki} className="text-[10px] px-1.5 py-0.5 rounded bg-subtle text-muted-foreground">
              #{k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
