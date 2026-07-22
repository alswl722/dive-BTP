"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "info" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastContextValue {
  /** 화면 하단에 잠깐 뜨는 알림. 기본 톤은 성공(초록 체크). */
  toast: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let seq = 0; // 토스트 고유 id 카운터

const TONE_META: Record<Tone, { Icon: typeof Info; color: string }> = {
  success: { Icon: CheckCircle2, color: "text-good" },
  info: { Icon: Info, color: "text-info" },
  error: { Icon: AlertTriangle, color: "text-bad" },
};

/** 전역 토스트 — 다운로드/저장 완료 같은 짧은 확인 메시지를 화면 하단 중앙에 띄운다. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, tone: Tone = "success") => {
      const id = ++seq;
      setToasts((t) => [...t, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 2600);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4">
          {toasts.map((t) => (
            <Toast key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // 마운트 직후 트랜지션을 위해 다음 프레임에 보이게 한다.
    const r = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const { Icon, color } = TONE_META[item.tone];
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2.5 text-[12.5px] shadow-modal transition-all duration-200",
        show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", color)} />
      <span className="font-medium">{item.message}</span>
      <button onClick={onDismiss} aria-label="닫기" className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
