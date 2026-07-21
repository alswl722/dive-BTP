"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Home, ClipboardList, Building2, ListChecks, PencilLine, Settings2, KeyRound, ChevronsLeft, ChevronsRight, ChevronDown, User, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUi, useReviewStatus } from "@/lib/app-state";
import { useAuth, isAdmin } from "@/lib/auth";
import { useAdminState } from "@/lib/admin-state";
import { useNotesData } from "@/lib/notes-data";
import { statusKey } from "@/lib/status-key";
import { dashboardReferenceDate, activePrograms, programApplicantIds, programKey as makeProgramKey } from "@/lib/program-progress";
import { REVIEW_STATUSES, type ReviewStatus } from "@/types";

/**
 * 심사 담당자·관리자 공통 메뉴.
 * 공지사항(/notices)은 메뉴에 두지 않는다 — 메인 페이지 공지 패널의 '전체 보기'로만
 * 진입한다(상시 참조가 아니라 확인용이라 메뉴를 차지할 필요가 없음).
 */
const NAV = [
  { href: "/", label: "메인 페이지", icon: Home },
  { href: "/programs", label: "지원 사업", icon: ClipboardList },
  { href: "/companies", label: "기업 선정", icon: Building2 },
  { href: "/selected", label: "선정 목록", icon: ListChecks },
  // 메모는 우측 하단 플로팅 FAB(NotesFab)로 이동 — 보던 페이지를 유지한 채 작성.
  // 전체 목록·검색은 /notes 페이지에 그대로 있으나(FAB 하단 링크), 상시 메뉴에선 제거.
];

/**
 * 관리자 전용 메뉴 — 담당자에게는 숨기고, AuthGate가 직접 진입도 차단한다.
 * 기능을 콘솔 한 곳에 탭으로 몰지 않고 목적별로 메뉴를 나눈다.
 */
const ADMIN_NAV = [
  { href: "/admin", label: "지원사업 설정", icon: Settings2 },
  { href: "/admin/permissions", label: "기업·심사자 권한", icon: KeyRound },
  { href: "/admin/notices", label: "공지사항 작성", icon: PencilLine },
];

export function Sidebar() {
  const path = usePathname();
  const searchParams = useSearchParams();
  const { sidebarCollapsed, toggleSidebar } = useUi();
  const { statuses } = useReviewStatus();
  const { user, logout } = useAuth();
  const { assigns } = useAdminState();
  const { companies, programs } = useNotesData();
  const [profileOpen, setProfileOpen] = useState(false);
  const admin = isAdmin(user);

  // 기업 선정 화면(/companies?program=...)에서 고른 사업 — 다른 화면에선 선택 사업이 없다.
  const selectedProgramKey = path.startsWith("/companies") ? searchParams.get("program") : null;
  const selectedProgram = useMemo(
    () => programs.find((p) => makeProgramKey(p) === selectedProgramKey) ?? null,
    [programs, selectedProgramKey]
  );

  // 선택된 사업의 신청기업만 대상으로 후보/선정/제외 3종을 센다.
  const programCounts = useMemo(() => {
    const c: Record<ReviewStatus, number> = { 후보: 0, 선정: 0, 제외: 0 };
    if (!selectedProgram) return c;
    const progKey = makeProgramKey(selectedProgram);
    for (const cid of programApplicantIds(selectedProgram, companies)) {
      const status = statuses[statusKey(cid, progKey)] ?? "후보";
      c[status]++;
    }
    return c;
  }, [selectedProgram, companies, statuses]);

  // 내가 배정받은 진행중 사업 개수(관리자는 진행중 전체 사업 개수).
  const myProgramCount = useMemo(() => {
    const ref = dashboardReferenceDate(programs);
    return activePrograms(programs, ref).filter(
      (p) => admin || assigns[makeProgramKey(p)] === user?.username
    ).length;
  }, [programs, assigns, admin, user]);

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-150",
        sidebarCollapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 bg-sidebar-logoBar px-4">
        {/* 로고 자체가 파란색 사선 마크라 브랜드블루 배경과 겹치면 묻힌다 — 흰 배경 칩으로 대비 확보 */}
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-white">
          <Image src="/btp-symbol.png" alt="BTP" fill className="object-contain p-1" />
        </div>
        {!sidebarCollapsed && <span className="truncate text-[13px] font-bold text-white">BTP 기업 심사</span>}
      </div>

      <nav className="flex flex-col gap-1 p-3">
        <NavGroup items={NAV} path={path} collapsed={sidebarCollapsed} />
        {isAdmin(user) && (
          <NavGroup items={ADMIN_NAV} path={path} collapsed={sidebarCollapsed} title="관리자" />
        )}
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
            <p className="truncate text-[10.5px] font-medium text-sidebar-foreground/70">이번 심사 현황</p>
            {REVIEW_STATUSES.map((s) => (
              <MiniStatRow key={s} label={s} value={selectedProgram ? programCounts[s] : null} />
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-1.5 text-[12px]">
              <span className="text-sidebar-foreground/80">{admin ? "진행중 전체 사업" : "내 배정 사업"}</span>
              <span className="font-bold tabular-nums text-white">{myProgramCount}개</span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-sidebar-logoBar py-2 text-center text-[11px] font-bold text-white">
            {myProgramCount}
          </div>
        )}

        <div className="relative">
          {profileOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-[190px] overflow-hidden rounded-lg bg-white py-1 shadow-modal">
              <ProfileMenuItem icon={User} label="프로필 설정" onClick={() => setProfileOpen(false)} />
              <ProfileMenuItem icon={Settings} label="시스템 설정" onClick={() => setProfileOpen(false)} />
              {/* 권한은 로그인 계정으로 정해지므로 임의 전환은 제공하지 않는다 */}
              <ProfileMenuItem
                icon={LogOut}
                label="로그아웃"
                onClick={() => {
                  setProfileOpen(false);
                  logout();
                }}
              />
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
            {/* 카톡 기본 프로필풍 실루엣 — 머리·어깨 비율을 직접 그린 SVG (어깨는 원 하단에 클리핑) */}
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[#9AAAB8]">
              <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
                <circle cx="16" cy="12" r="6.2" fill="white" />
                <path d="M16 20.5c-6.8 0-11 4-11 9v2.5h22V29.5c0-5-4.2-9-11-9z" fill="white" />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[12px] font-medium text-white">{user?.name ?? "게스트"}</p>
                  <p className="truncate text-[10.5px] text-sidebar-foreground/70">
                    {user ? `${user.dept} · ${user.role}` : "미로그인"}
                  </p>
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

/**
 * 메뉴 그룹. title이 있으면 구분선과 라벨을 붙여 심사자용/관리자용을 시각적으로 나눈다.
 * 접힌 상태에서는 라벨 대신 구분선만 둔다(폭이 없어 텍스트가 깨짐).
 */
function NavGroup({
  items,
  path,
  collapsed,
  title,
}: {
  items: { href: string; label: string; icon: typeof Home }[];
  path: string;
  collapsed: boolean;
  title?: string;
}) {
  return (
    <>
      {title && (
        <div className={cn("mt-3 border-t border-white/10 pt-3", collapsed && "mx-2")}>
          {!collapsed && (
            <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/50">
              {title}
            </p>
          )}
        </div>
      )}
      {items.map(({ href, label, icon: Icon }) => {
        // 정확 일치 우선 — /admin 이 /admin/notices 에서도 활성화되는 것을 막는다
        const active = href === "/" || href === "/admin" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
              collapsed && "justify-center px-0",
              active ? "bg-primary font-bold text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </>
  );
}

function MiniStatRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-sidebar-foreground/80">{label}</span>
      <span className="font-bold tabular-nums text-white">{value ?? "-"}</span>
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
