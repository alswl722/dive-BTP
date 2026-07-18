"use client";

// UI만 구현(README "5. 챗봇 FAB" — 실 LLM 응답 미연동, 고정 안내 문구로 800ms 후 응답).
import { useState, type FormEvent } from "react";
import { Sparkles, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLE_QUESTIONS = [
  "최근 3년 3건 이상 수혜 기업은?",
  "종합점수 65점 이상 기업 목록",
  "데이터 품질 이슈가 있는 기업은?",
  "이번 사업 선정 현황 요약해줘",
];

const CANNED_REPLY = "챗봇 응답 기능은 준비 중입니다. 실제 LLM 연동은 별도 작업으로 진행될 예정이에요.";

interface Message {
  role: "user" | "bot";
  text: string;
}

export function ChatbotFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  function send(text: string) {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "bot", text: CANNED_REPLY }]);
      setLoading(false);
    }, 800);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[420px] w-[320px] flex-col overflow-hidden rounded-xl bg-card shadow-modal">
          <div className="flex h-12 shrink-0 items-center justify-between bg-sidebar px-4">
            <span className="text-[13px] font-bold text-white">심사 도우미</span>
            <button onClick={() => setOpen(false)} className="text-sidebar-foreground hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-[11.5px] text-muted-foreground">궁금한 걸 물어보세요. 예시:</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-full bg-info-bg px-2.5 py-1 text-[11px] text-info hover:opacity-80"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-[12px] leading-relaxed",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-muted px-3 py-2 text-[12px] text-muted-foreground">···</div>
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="flex shrink-0 gap-1.5 border-t p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="메시지 입력…"
              className="flex-1 rounded-md border bg-subtle px-2.5 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-ring/40"
            />
            <button type="submit" className="flex items-center justify-center rounded-md bg-primary px-2.5 text-primary-foreground">
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-modal transition-transform hover:scale-105"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>
    </div>
  );
}
