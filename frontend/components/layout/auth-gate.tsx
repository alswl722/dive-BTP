"use client";

// 로그인 게이트 — 미로그인 시 로그인 화면만, 로그인 후 앱 셸(사이드바·탑바)을 렌더.
//
// app router의 root layout은 모든 경로를 감싸므로, 로그인 화면에서 사이드바를 숨기려면
// 여기서 분기해야 한다. 미들웨어 대신 클라이언트 게이트를 쓰는 이유는 세션을
// sessionStorage에 두기 때문(서버가 알 수 없음) — 데모 범위에서의 선택.

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth, isAdmin } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { ChatbotFab } from "@/components/chatbot-fab";

const LOGIN_PATH = "/login";
/** 관리자만 접근 가능한 경로 */
const ADMIN_PATHS = ["/admin"];

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const path = usePathname();
  const router = useRouter();

  const needsAdmin = ADMIN_PATHS.some((p) => path.startsWith(p));

  useEffect(() => {
    if (loading) return;
    if (!user && path !== LOGIN_PATH) {
      router.replace(LOGIN_PATH);
    } else if (user && path === LOGIN_PATH) {
      router.replace("/");
    } else if (user && needsAdmin && !isAdmin(user)) {
      router.replace("/"); // 담당자가 관리자 경로 접근 시
    }
  }, [loading, user, path, needsAdmin, router]);

  // 로그인 화면은 세션이 없어도 그릴 수 있다 — loading 게이트보다 먼저 처리해야
  // 서버 렌더에서 빈 화면이 나오지 않는다(세션은 클라이언트에만 있으므로 서버는 항상 loading).
  if (path === LOGIN_PATH) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  // 세션 복원 중 / 리다이렉트 직전 — 보호 화면이 한 프레임이라도 노출되지 않게 차단
  if (loading || !user || (needsAdmin && !isAdmin(user))) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-[12.5px] text-muted-foreground">불러오는 중…</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
      <ChatbotFab />
    </>
  );
}
