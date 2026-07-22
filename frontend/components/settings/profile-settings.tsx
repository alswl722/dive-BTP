"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, Check, IdCard, KeyRound, NotebookPen, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NoteBody } from "@/components/notes/note-body";
import { useAuth } from "@/lib/auth";
import { useNotesStore } from "@/lib/notes-store";
import { relativeTime } from "@/lib/notes";
import { cn } from "@/lib/utils";

/**
 * 프로필 설정 — 로그인 계정의 표시 정보. 이름·부서만 수정 가능(세션 반영).
 * 계정(username)·역할은 로그인 계정으로 고정이라 바꿀 수 없다(권한이 계정에 묶임).
 */
export function ProfileSettings() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [dept, setDept] = useState(user?.dept ?? "");
  const [saved, setSaved] = useState(false);

  // 세션 복원이 늦게 끝나면 초기값이 비어 들어올 수 있어 동기화
  useEffect(() => {
    setName(user?.name ?? "");
    setDept(user?.dept ?? "");
  }, [user]);

  if (!user) return null;
  const admin = user.role === "관리자";
  const dirty = name.trim() !== user.name || dept.trim() !== user.dept;

  function save() {
    if (!dirty) return;
    updateProfile({ name: name.trim() || user!.name, dept: dept.trim() || user!.dept });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <UserRound className="h-5 w-5 text-primary" />
          <h1 className="text-[20px] font-extrabold tracking-tight">프로필 설정</h1>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          화면에 표시되는 이름과 부서를 관리합니다. 계정과 역할은 로그인 계정으로 고정됩니다.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#9AAAB8]">
            <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
              <circle cx="16" cy="12" r="6.2" fill="white" />
              <path d="M16 20.5c-6.8 0-11 4-11 9v2.5h22V29.5c0-5-4.2-9-11-9z" fill="white" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">{user.name}</p>
            <span className="mt-0.5 inline-flex items-center gap-1.5">
              <Badge variant={admin ? "info" : "secondary"}>{user.role}</Badge>
              <span className="text-[11.5px] text-muted-foreground">{user.dept}</span>
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="이름">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-[12.5px] outline-none focus:border-primary"
            />
          </Field>
          <Field label="부서">
            <input
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-[12.5px] outline-none focus:border-primary"
            />
          </Field>
          <Field label="계정" icon={<IdCard className="h-3.5 w-3.5" />}>
            <input
              value={user.username}
              disabled
              className="w-full cursor-not-allowed rounded-md border bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground"
            />
          </Field>
          <Field label="역할" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
            <input
              value={user.role}
              disabled
              className="w-full cursor-not-allowed rounded-md border bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2">
          {saved && !dirty && <span className="text-[11.5px] text-good">저장되었습니다</span>}
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-medium transition-colors",
              dirty ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-muted text-muted-foreground"
            )}
          >
            <Check className="h-3.5 w-3.5" />
            저장
          </button>
        </div>
      </Card>

      {/* 권한 요약 — 역할이 무엇을 할 수 있는지 명시(권한은 계정에 묶임) */}
      <Card className="space-y-2.5 p-5">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="text-[12.5px] font-bold">내 권한</p>
        </div>
        <ul className="space-y-1.5 text-[12px] text-muted-foreground">
          {(admin
            ? ["전 지원사업 심사", "담당자 배정·심사 잠금·사업 상태 설정", "공지사항 작성", "전사 심사 현황 열람"]
            : ["배정받은 지원사업만 심사", "전체 지원사업 정보 열람", "메모·공지 확인"]
          ).map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              {t}
            </li>
          ))}
        </ul>
        <p className="border-t pt-2 text-[11px] text-muted-foreground">
          권한은 로그인 계정으로 정해집니다. 역할 변경은 다른 계정으로 로그인하세요.
        </p>
      </Card>

      <PasswordCard />
      <MyNotesCard authorName={user.name} />
    </div>
  );
}

/** 비밀번호 변경 — 데모용(오버라이드를 이 브라우저에 저장). */
function PasswordCard() {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    setMsg(null);
    if (next !== confirm) {
      setMsg({ ok: false, text: "새 비밀번호가 서로 다릅니다." });
      return;
    }
    const r = changePassword(current, next);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error ?? "변경에 실패했습니다." });
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setMsg({ ok: true, text: "비밀번호가 변경되었습니다. 다음 로그인부터 적용됩니다." });
  }

  const canSubmit = current && next && confirm;

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center gap-1.5">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <p className="text-[12.5px] font-bold">비밀번호 변경</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="현재 비밀번호"
          className="rounded-md border bg-background px-3 py-2 text-[12.5px] outline-none focus:border-primary" />
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="새 비밀번호(4자+)"
          className="rounded-md border bg-background px-3 py-2 text-[12.5px] outline-none focus:border-primary" />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="새 비밀번호 확인"
          className="rounded-md border bg-background px-3 py-2 text-[12.5px] outline-none focus:border-primary" />
      </div>
      {msg && (
        <p className={cn("flex items-start gap-1.5 text-[11.5px]", msg.ok ? "text-good" : "text-bad")}>
          {!msg.ok && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          {msg.text}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">※ 데모 — 변경 비밀번호는 이 브라우저에만 저장됩니다.</span>
        <button type="button" onClick={submit} disabled={!canSubmit}
          className={cn("rounded-md px-3.5 py-2 text-[12.5px] font-medium transition-colors",
            canSubmit ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-muted text-muted-foreground")}>
          변경
        </button>
      </div>
    </Card>
  );
}

/** 내가 쓴 메모 — 공유 store에서 author 기준으로 필터. */
function MyNotesCard({ authorName }: { authorName: string }) {
  const { notes, remove } = useNotesStore();
  const mine = useMemo(
    () => notes.filter((n) => n.author === authorName).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notes, authorName]
  );

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <NotebookPen className="h-4 w-4 text-muted-foreground" />
          <p className="text-[12.5px] font-bold">내 메모</p>
          <span className="text-[11px] text-muted-foreground">{mine.length}개</span>
        </div>
        <Link href="/notes" className="text-[11.5px] text-primary hover:underline">전체 메모</Link>
      </div>

      {mine.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3.5 py-6 text-center text-[12px] text-muted-foreground">
          작성한 메모가 없습니다. 우측 하단 메모 버튼으로 남길 수 있습니다.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {mine.slice(0, 8).map((n) => (
            <li key={n.id} className="flex items-start gap-2 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <NoteBody body={n.body} className="text-[12px]" />
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">{relativeTime(n.createdAt)}</p>
              </div>
              <button type="button" onClick={() => remove(n.id)} aria-label="메모 삭제"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-bad-bg hover:text-bad">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {mine.length > 8 && (
        <p className="text-center text-[11px] text-muted-foreground">
          최근 8개 표시 · 전체는 <Link href="/notes" className="text-primary hover:underline">메모 화면</Link>에서
        </p>
      )}
    </Card>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}
