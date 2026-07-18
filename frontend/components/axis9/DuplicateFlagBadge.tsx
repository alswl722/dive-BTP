"use client";

import { AlertTriangle, CheckCircle2, Eye, Info, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const style = FLAG_STYLE[flag.status];
  const Icon = style.icon;

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
      <Icon className="h-3 w-3" />
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
          <p className="text-[10.5px] text-muted-foreground">총 지원금 (천원)</p>
          <p className="text-[19px] font-extrabold tabular-nums mt-0.5">
            {flag.totalAmountThousand.toLocaleString()}
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

      {/* 성장률 상태 */}
      <div className="flex items-center gap-2 rounded-lg border p-3 text-[12.5px]">
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          성장 상태:{" "}
          <span className="font-medium text-foreground">
            {flag.growthState === "stagnant" ? "정체 (성장률 하위 30%)" :
             flag.growthState === "growing" ? "성장" : "판정 불가 (데이터 부족)"}
          </span>
          {" · "}
          반복 지원:{" "}
          <span className="font-medium text-foreground">
            {flag.isRepeat ? "예" : "아니오"}
          </span>
        </p>
      </div>

      {/* 판정 로직 설명 */}
      {flag.status === "flag" && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-3 text-[12px] text-[hsl(30_75%_38%)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            반복적으로 지원받았으나 성과 정체 신호. 중복수혜 가이드라인 검토 대상.
          </p>
        </div>
      )}
      {flag.status === "cleared" && (
        <div className="flex items-start gap-2 rounded-lg bg-[hsl(140_55%_95%)] px-3 py-3 text-[12px] text-[hsl(140_55%_25%)]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            반복 지원 후 성장 확인. 지원 효과가 있는 케이스로 판단.
          </p>
        </div>
      )}
    </div>
  );
}
