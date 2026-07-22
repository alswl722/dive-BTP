"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewStatus } from "@/types";

/** 결정별 사유 템플릿 — 클릭하면 입력칸에 채워진다(그대로 두거나 이어서 편집). */
const TEMPLATES: Record<"선정" | "제외", string[]> = {
  선정: ["기술력·재무 우수", "사업 정합성 높음", "성장성·고용 기여", "지역 전략산업 부합"],
  제외: ["재무 위험(자본잠식·연명 등)", "반복 수혜 과다", "사업 정합성 낮음", "인증 대비 실적 부족"],
};

/**
 * 심사 결정 사유 미니 모달 — 선정/제외를 고르면 뜬다.
 * "왜 그렇게 결정했나"의 근거를 남겨 심사 투명성·감사 추적을 만든다(발제 문제의식 직결).
 * 사유는 선택 입력(비워도 결정은 저장) — 매 결정마다 강제하면 흐름이 끊긴다.
 */
export function DecisionReasonModal({
  company,
  decision,
  initialReason,
  onConfirm,
  onClose,
}: {
  company: string;
  decision: Extract<ReviewStatus, "선정" | "제외">;
  initialReason: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(initialReason);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tone = decision === "선정" ? "text-good" : "text-bad";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-card p-5 shadow-modal">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-[13px] font-bold">
              <span className={tone}>{decision}</span> 사유를 적어주세요
            </p>
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{company}</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mb-2 flex flex-wrap gap-1.5">
          {TEMPLATES[decision].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setReason((r) => (r.trim() ? r : t))}
              className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >
              {t}
            </button>
          ))}
        </div>

        <textarea
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="예: 등록특허·정부 R&D 실적 우수, 사업목적과 정합성 높음"
          className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-[12.5px] outline-none focus:border-primary"
        />

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">사유는 비워도 됩니다(권장).</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-3.5 py-2 text-[12.5px] text-muted-foreground hover:bg-muted">
              취소
            </button>
            <button
              type="button"
              onClick={() => onConfirm(reason.trim())}
              className={cn(
                "rounded-md px-3.5 py-2 text-[12.5px] font-medium text-white",
                decision === "선정" ? "bg-good hover:opacity-90" : "bg-bad hover:opacity-90"
              )}
            >
              {decision} 확정
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
