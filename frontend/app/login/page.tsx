"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogIn, ShieldCheck, User } from "lucide-react";
import { DEMO_ACCOUNTS, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = login(username, password);
    if (res.ok) {
      router.replace("/");
    } else {
      setError(res.error ?? "로그인에 실패했습니다.");
      setBusy(false);
    }
  }

  /** 데모 계정 빠른 입력 — 발표 시연 중 타이핑 실수를 막는다. */
  function fill(u: string, p: string) {
    setUsername(u);
    setPassword(p);
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center">
          <div className="relative mb-3 h-12 w-12 overflow-hidden rounded-xl bg-primary">
            <Image src="/btp-symbol.png" alt="BTP" fill className="object-contain p-2" />
          </div>
          <h1 className="text-[19px] font-extrabold tracking-tight">부산TP 기업 선정 시스템</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">심사 담당자 · 관리자 전용</p>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
          <div>
            <label htmlFor="username" className="mb-1 block text-[12px] font-medium">아이디</label>
            <input
              id="username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null); }}
              autoComplete="username"
              className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
              placeholder="아이디를 입력하세요"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-[12px] font-medium">비밀번호</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              autoComplete="current-password"
              className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-bad-bg px-3 py-2 text-[12px] text-bad">{error}</p>
          )}

          <button
            type="submit"
            disabled={!username || !password || busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-[13px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <LogIn className="h-4 w-4" />
            로그인
          </button>
        </form>

        {/* 데모 계정 안내 — 발표 시연용. 실 운영에서는 제거할 것. */}
        <div className="mt-4 rounded-xl border border-dashed p-3.5">
          <p className="mb-2 text-[11.5px] font-medium text-muted-foreground">데모 계정 (클릭하면 자동 입력)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.username}
                type="button"
                onClick={() => fill(a.username, a.password)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50",
                  username === a.username && "border-primary"
                )}
              >
                {a.role === "관리자" ? (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block text-[12px] font-bold">{a.role}</span>
                  <span className="block text-[11px] tabular-nums text-muted-foreground">
                    {a.username} / {a.password}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
