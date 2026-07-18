"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Home, ClipboardList, Building2, ChevronsLeft, ChevronsRight, ChevronDown, User, Settings, LogOut, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUi, useReviewStatus } from "@/lib/app-state";
import { useRole } from "@/lib/roles";

const NAV = [
  { href: "/", label: "메인 페이지", icon: Home },
  { href: "/programs", label: "지원 사업", icon: ClipboardList },
  { href: "/companies", label: "기업 선정", icon: Building2 },
];

export function Sidebar() {
  const path = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUi();
  const { statuses } = useReviewStatus();
  const { role, setRole } = useRole();
  const [profileOpen, setProfileOpen] = useState(false);

  const counts = { 후보: 0, 선정: 0, 제외: 0 };
  for (const s of Object.values(statuses)) {
    if (s === "후보" || s === "선정" || s === "제외") counts[s]++;
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-150",
        sidebarCollapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 bg-sidebar-logoBar px-4">
        <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md bg-primary">
          <Image src="/btp-symbol.png" alt="BTP" fill className="object-contain p-1" />
        </div>
        {!sidebarCollapsed && <span className="truncate text-[13px] font-bold text-white">부산TP 심사</span>}
      </div>

      <nav className="flex flex-col gap-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={sidebarCollapsed ? label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
                sidebarCollapsed && "justify-center px-0",
                active ? "bg-primary font-bold text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={toggleSidebar}
        className={cn(
          "mx-3 flex items-center gap-2.5 rounded-md px-3 py-2 text-[12px] text-sidebar-foreground/70 transition-colors hover:bg-white/5 hover:text-white",
          sidebarCollapsed && "justify-center px-0"
        )}
      >
        {sidebarCollapsed ? <ChevronsRight className="h-4 w-4 shrink-0" /> : <ChevronsLeft className="h-4 w-4 shrink-0" />}
        {!sidebarCollapsed && <span>접기</span>}
      </button>

      <div className="mt-auto flex flex-col gap-3 p-3">
        {!sidebarCollapsed ? (
          <div className="space-y-1.5 rounded-lg bg-sidebar-logoBar p-3">
            <p className="mb-1.5 text-[10.5px] font-medium text-sidebar-foreground/70">이번 심사 현황</p>
            <MiniStatRow label="후보" value={counts.후보} />
            <MiniStatRow label="선정" value={counts.선정} />
            <MiniStatRow label="제외" value={counts.제외} />
          </div>
        ) : (
          <div className="rounded-lg bg-sidebar-logoBar py-2 text-center text-[11px] font-bold text-white">
            {counts.선정}
          </div>
        )}

        <div className="relative">
          {profileOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-[190px] overflow-hidden rounded-lg bg-white py-1 shadow-modal">
              <ProfileMenuItem icon={User} label="프로필 설정" onClick={() => setProfileOpen(false)} />
              <ProfileMenuItem icon={Settings} label="시스템 설정" onClick={() => setProfileOpen(false)} />
              <ProfileMenuItem
                icon={UserCog}
                label={`${role === "관리자" ? "담당자" : "관리자"}로 전환`}
                onClick={() => {
                  setRole(role === "관리자" ? "담당자" : "관리자");
                  setProfileOpen(false);
                }}
              />
              <ProfileMenuItem icon={LogOut} label="로그아웃" onClick={() => setProfileOpen(false)} />
            </div>
          )}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setProfileOpen((v) => !v)}
            onKeyDown={(e) => e.key === "Enter" && setProfileOpen((v) => !v)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-white/5",
              sidebarCollapsed && "justify-center"
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
              {role === "관리자" ? "관" : "담"}
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[12px] font-medium text-white">
                    {role === "관리자" ? "전사 관리자" : "심사 담당자"}
                  </p>
                  <p className="truncate text-[10.5px] text-sidebar-foreground/70">기업지원팀 · {role}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function MiniStatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-sidebar-foreground/80">{label}</span>
      <span className="font-bold tabular-nums text-white">{value}</span>
    </div>
  );
}

function ProfileMenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof User;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-foreground hover:bg-muted"
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {label}
    </button>
  );
}
