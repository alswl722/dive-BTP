"use client";

import { AlertTriangle, CheckCircle2, Eye, Info, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatKRW } from "@/lib/utils";
import type { DuplicateFlag, FlagStatus } from "@/types";

const FLAG_STYLE: Record<FlagStatus, {
  variant: "good" | "info" | "warn" | "bad" | "slate";
  icon: typeof AlertTriangle;
  label: string;
}> = {
  flag:    { variant: "bad",  icon: AlertTriangle, label: "🔴 검토 필요" },
  cleared: { variant: "good", icon: CheckCircle2,  label: "🟢 지원 효과" },
  observe: { variant: "info", icon: Eye,           label: "⚪ 관측만" },
  normal:  { variant: "slate", icon: CheckCircle2, label: "정상" },
  unknown: { variant: "slate", icon: HelpCircle,   label: "판정 대기" },
};

export function DuplicateFlagBadge({ flag }: { flag: DuplicateFlag | null }) {
  if (!flag) return null;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
         style={{
           backgroundColor: flag.status === "flag" ? "hsl(0 75% 96%)" :
                           flag.status === "cleared" ? "hsl(140 55% 95%)" :
                           flag.status === "observe" ? "hsl(210 60% 96%)" : "hsl(220 15% 95%)",
           color: flag.status === "flag" ? "hsl(0 75% 40%)" :
                  flag.status === "cleared" ? "hsl(140 55% 30%)" :
                  flag.status === "observe" ? "hsl(210 60% 40%)" : "hsl(220 15% 40%)",
         }}>
      <span>{flag.label}</span>
    </div>
  );
}

export function DuplicateFlagDetailPanel({ flag }: { flag: DuplicateFlag | null }) {
  if (!flag) {
    return (
      <div className="rounded-lg bg-subtle p-4 text-[12.5px] text-muted-foreground">
        지원 이력 없음 — flag 판정 대상 없음
      </div>
    );
  }

  const style = FLAG_STYLE[flag.status];

  return (
    <div className="space-y-4">
      {/* 상단 배지 + 라벨 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-bold">종합 판정</p>
          <DuplicateFlagBadge flag={flag} />
        </div>
        {flag.segment && (
          <Badge variant="slate" className="text-[10px]">
            {flag.segment}
          </Badge>
        )}
      </div>

      {/* 근거 지표 그리드 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-subtle p-3 text-center">
          <p className="text-[10.5px] text-muted-foreground">지원 건수</p>
          <p className="text-[19px] font-extrabold tabular-nums mt-0.5">{flag.supportCount}</p>
        </div>
        <div className="rounded-lg bg-subtle p-3 text-center">
          <p className="text-[10.5px] text-muted-foreground">총 지원금</p>
          <p className="text-[19px] font-extrabold tabular-nums mt-0.5">
            {formatKRW(flag.totalAmountThousand)}
          </p>
        </div>
        <div className="rounded-lg bg-subtle p-3 text-center">
          <p className="text-[10.5px] text-muted-foreground">사업유형 다양성</p>
          <p className="text-[19px] font-extrabold tabular-nums mt-0.5">
            {flag.businessTypeDiversity}
            {flag.isHighDiversity && <span className="text-[10px] ml-1 text-warn">↑</span>}
          </p>
        </div>
        <div className="rounded-lg bg-subtle p-3 text-center">
          <p className="text-[10.5px] text-muted-foreground">최장 연속수혜</p>
          <p className="text-[19px] font-extrabold tabular-nums mt-0.5">{flag.maxConsecutiveYears}년</p>
        </div>
      </div>

      {/* 성장 판정 근거 카드 — 임계값(하위 30%) 대비 실측 수치 노출 */}
      <GrowthEvidenceCard flag={flag} />

      {/* 판정 요약 — "반복 지원 예/아니오 × 성장/정체" 사실과 그 결론을 한 문장·한 박스로.
          예전엔 값 나열 박스(중립)와 결론 설명 박스(flag/cleared만 존재)가 따로 있어서
          같은 판정을 두 번 읽어야 했고, observe/normal은 설명이 아예 없었다. */}
      <VerdictSummary flag={flag} />
    </div>
  );
}

/** 상태별 톤(배경·글자색) — DuplicateFlagBadge 배지 색과 계열 통일. */
const VERDICT_TONE: Record<FlagStatus, { bg: string; text: string; icon: typeof AlertTriangle }> = {
  flag:    { bg: "bg-warn-bg",              text: "text-[hsl(30_75%_38%)]",  icon: AlertTriangle },
  cleared: { bg: "bg-[hsl(140_55%_95%)]",   text: "text-[hsl(140_55%_25%)]", icon: CheckCircle2 },
  observe: { bg: "bg-info-bg",              text: "text-info",               icon: Eye },
  normal:  { bg: "bg-subtle",               text: "text-muted-foreground",   icon: CheckCircle2 },
  unknown: { bg: "bg-subtle",               text: "text-muted-foreground",   icon: HelpCircle },
};

/**
 * 성장×반복 truth table의 사실(성장상태·반복여부)과 결론을 한 문장·한 박스로.
 *
 * 이전엔 "성장 상태: 성장 · 반복 지원: 예"(중립 박스)와 "반복 지원 후 성장 확인…"
 * (색깔 박스, flag/cleared만 존재)이 따로 있어 같은 판정을 두 번 읽어야 했고
 * observe·normal은 설명 자체가 없었다. 사실을 문장 안에 녹여 5개 상태 모두 채운다.
 */
function VerdictSummary({ flag }: { flag: DuplicateFlag }) {
  const tone = VERDICT_TONE[flag.status];
  const Icon = tone.icon;
  const repeatLabel = flag.isRepeat ? "반복 지원" : "단발 지원";
  const growthLabel =
    flag.growthState === "stagnant" ? "성장 정체" :
    flag.growthState === "growing" ? "성장 중" : "성장률 데이터 없음";

  const sentence = (() => {
    switch (flag.status) {
      case "flag":
        return `${repeatLabel} 중 ${growthLabel} — 중복수혜 가이드라인 검토 대상.`;
      case "cleared":
        return `${repeatLabel} 후 ${growthLabel} 확인 — 지원 효과가 있는 케이스로 판단.`;
      case "observe":
        return `${repeatLabel}이지만 ${growthLabel} — 반복 여부는 계속 관측 필요.`;
      case "normal":
        return `${repeatLabel} · ${growthLabel} — 특이사항 없음.`;
      case "unknown":
      default:
        return `${growthLabel}(축1 대기)라 판정할 수 없습니다. (${repeatLabel})`;
    }
  })();

  return (
    <div className={cn("flex items-start gap-2 rounded-lg px-3 py-3 text-[12.5px]", tone.bg, tone.text)}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>{sentence}</p>
    </div>
  );
}

/**
 * 성장 판정 근거 카드 — 축1(재무축) 산출을 임계값(하위 30%) 대비 표시.
 *
 * 왜 별 카드로 뽑았나: "성장/정체" 라벨만 있고 근거 수치가 없으면 담당자가
 * 왜 그렇게 판정됐는지 확인 못한다. 임계선(30) + 실측 성장성점수·CAGR·매출증가액을
 * 나란히 놓아 "임의값 아닌 실 지표로 판정" 근거를 발표·심사 양쪽에 노출한다.
 *
 * growthScore가 null이면 카드 자체를 렌더링하지 않고 "판정 불가" 라인이
 * 아래 요약 배지가 대신 알림 — 카드가 빈 껍데기로 보이는 것 방지.
 */
function GrowthEvidenceCard({ flag }: { flag: DuplicateFlag }) {
  const score = flag.growthScore;
  if (score == null) return null;   // 축1 미연결 or 자본잠식 — 아래 요약 라인이 대신 안내

  const STAGNANT_THRESHOLD = 30;    // axis9_thresholds.yaml flag_logic.growth_score_stagnant
  const cagrPct = flag.revenueCagr != null ? `${(flag.revenueCagr * 100).toFixed(1)}%` : "—";
  const deltaKrw = flag.revenueDelta != null
    ? `${flag.revenueDelta >= 0 ? "+" : ""}${formatKRW(flag.revenueDelta)}`
    : "—";
  const percentileLabel = score < STAGNANT_THRESHOLD
    ? `하위 ${Math.round(score)}% (정체 임계선 이내)`
    : `상위 ${Math.round(100 - score)}% (성장)`;

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[12px] font-bold">성장 판정 근거</p>
        <span className="text-[10.5px] text-muted-foreground">
          · 임계선: 성장성점수 {STAGNANT_THRESHOLD} 미만 = 정체
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded bg-subtle p-2 text-center">
          <p className="text-[10px] text-muted-foreground">성장성점수</p>
          <p className="mt-0.5 text-[15px] font-extrabold tabular-nums">
            {Math.round(score)}
            <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">/100</span>
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{percentileLabel}</p>
        </div>
        <div className="rounded bg-subtle p-2 text-center">
          <p className="text-[10px] text-muted-foreground">매출 CAGR</p>
          <p className={cn(
            "mt-0.5 text-[15px] font-extrabold tabular-nums",
            flag.revenueCagr != null && flag.revenueCagr < 0 && "text-bad",
          )}>
            {cagrPct}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">최근 4개년</p>
        </div>
        <div className="rounded bg-subtle p-2 text-center">
          <p className="text-[10px] text-muted-foreground">매출 증가액</p>
          <p className={cn(
            "mt-0.5 text-[15px] font-extrabold tabular-nums",
            flag.revenueDelta != null && flag.revenueDelta < 0 && "text-bad",
          )}>
            {deltaKrw}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">4년 누적</p>
        </div>
      </div>
    </div>
  );
}
