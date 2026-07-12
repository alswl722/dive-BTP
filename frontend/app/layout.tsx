import type { Metadata } from "next";
import "./globals.css";
import { RoleProvider } from "@/lib/roles";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: "BTP 심사 보조 대시보드",
  description: "부산테크노파크 기업지원 심사 보조 — 재무 스코어카드 · 중복지원 탐지",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <RoleProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-6">{children}</main>
            </div>
          </div>
        </RoleProvider>
      </body>
    </html>
  );
}
