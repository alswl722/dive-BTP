"use client";

// 심사 챗봇 FAB — 자연어 질문 → DeepSeek 텍스트투SQL → 결과 표 + 요약.
// 화면을 클릭하며 확인해야 할 정보를 대신 조회. 답변에는 실행된 SQL을
// 접어서 노출해(신뢰) intent 문구로 "이 질문을 이렇게 해석했다"를 밝힌다.
import { useState, type FormEvent } from "react";
import { Sparkles, X, Send, ChevronDown, ChevronUp } from "lucide-react";
import { askChatbot, chatbotAvailable } from "@/lib/api";
import type { ChatbotAnswer } from "@/types";
import { cn } from "@/lib/utils";

const EXAMPLE_QUESTIONS = [
  "최근 3년 3건 이상 선정된 기업은?",
  "지원금 총액 상위 5개 기업",
  "벤처인증 보유 기업 중 2024년 매출 상위 10",
  "부산시 소재 기업 몇 개?",
];

type Message =
  | { role: "user"; text: string }
  | { role: "bot"; kind: "answer"; data: ChatbotAnswer }
  | { role: "bot"; kind: "error"; text: string };

export function ChatbotFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const data = await askChatbot(q);
      setMessages((prev) => [...prev, { role: "bot", kind: "answer", data }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "요청 실패";
      setMessages((prev) => [...prev, { role: "bot", kind: "error", text: msg }]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[520px] w-[420px] flex-col overflow-hidden rounded-xl bg-card shadow-modal">
          <div className="flex h-12 shrink-0 items-center justify-between bg-sidebar px-4">
            <span className="text-[13px] font-bold text-white">심사 도우미</span>
            <button onClick={() => setOpen(false)} className="text-sidebar-foreground hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
            {!chatbotAvailable && (
              <div className="rounded-md bg-warn-bg px-3 py-2 text-[11.5px] text-[hsl(30_75%_38%)]">
                백엔드 API가 연결되지 않아 챗봇을 사용할 수 없습니다.
              </div>
            )}

            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-[11.5px] text-muted-foreground">
                  DB 안 정보를 자연어로 물어보세요. 예시:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      disabled={!chatbotAvailable || loading}
                      className="rounded-full bg-info-bg px-2.5 py-1 text-[11px] text-info hover:opacity-80 disabled:opacity-40"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-[12px] leading-relaxed text-primary-foreground">
                    {m.text}
                  </div>
                </div>
              ) : m.kind === "error" ? (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[90%] rounded-lg bg-bad-bg px-3 py-2 text-[12px] leading-relaxed text-bad">
                    {m.text}
                  </div>
                </div>
              ) : (
                <BotAnswer key={i} data={m.data} />
              )
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-muted px-3 py-2 text-[12px] text-muted-foreground">
                  조회 중···
                </div>
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="flex shrink-0 gap-1.5 border-t p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="메시지 입력…"
              disabled={!chatbotAvailable || loading}
              className="flex-1 rounded-md border bg-subtle px-2.5 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!chatbotAvailable || loading || !input.trim()}
              className="flex items-center justify-center rounded-md bg-primary px-2.5 text-primary-foreground disabled:opacity-40"
            >
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

/** 챗봇 응답 렌더. 요약 → intent → 결과표(최대 5행 노출, 더 있으면 접힘) → SQL(접힘). */
function BotAnswer({ data }: { data: ChatbotAnswer }) {
  const [tableOpen, setTableOpen] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const hasRows = data.rows.length > 0;
  const visibleRows = tableOpen ? data.rows : data.rows.slice(0, 5);

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%] space-y-1.5 rounded-lg bg-muted p-2.5 text-[12px] leading-relaxed">
        <p className="text-foreground">{data.answer}</p>

        {data.intent && (
          <p className="text-[11px] text-muted-foreground">해석: {data.intent}</p>
        )}

        {hasRows && (
          <div className="rounded-md border bg-card">
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-subtle">
                  <tr>
                    {data.columns.map((c) => (
                      <th key={c} className="border-b px-2 py-1 text-left font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, i) => (
                    <tr key={i} className="odd:bg-subtle/40">
                      {data.columns.map((c) => (
                        <td key={c} className="px-2 py-1 tabular-nums">
                          {formatCell(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.rows.length > 5 && (
              <button
                onClick={() => setTableOpen((v) => !v)}
                className="flex w-full items-center justify-center gap-1 border-t px-2 py-1 text-[11px] text-muted-foreground hover:bg-subtle"
              >
                {tableOpen ? (
                  <>
                    <ChevronUp className="h-3 w-3" /> 접기
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" /> 전체 {data.rows.length}행 보기
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {data.sql && (
          <div>
            <button
              onClick={() => setSqlOpen((v) => !v)}
              className="flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              {sqlOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              실행된 SQL
            </button>
            {sqlOpen && (
              <pre className="mt-1 overflow-x-auto rounded bg-card p-2 text-[10.5px] leading-relaxed">
                {data.sql}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Y" : "N";
  if (typeof v === "number") return v.toLocaleString("ko-KR");
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
