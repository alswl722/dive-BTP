import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// 가변 폰트 하나로 전체 굵기 커버 — tailwind의 font-sans(var(--font-sans))가 이 변수를 읽는다.
const notoSansKR = localFont({
  src: "./fonts/NotoSansKR-VF.ttf",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});
import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { ChatbotFab } from "@/components/chatbot-fab";
import { listCompanies } from "@/lib/api";
import type { ReviewStatus } from "@/types";

export const metadata: Metadata = {
  title: "부산TP 기업 선정 시스템",
  description: "부산테크노파크 기업지원 심사 보조 — 재무 스코어카드 · 중복지원 탐지 · 기업 선정",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const companies = await listCompanies();
  const initialReviewStatus: Record<number, ReviewStatus> = Object.fromEntries(
    companies.map((c) => [c.id, c.reviewStatus])
  );

  return (
    <html lang="ko" className={notoSansKR.variable}>
      <body className="font-sans">
        <Providers initialReviewStatus={initialReviewStatus}>
          <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-y-auto p-6">{children}</main>
            </div>
          </div>
          <ChatbotFab />
        </Providers>
      </body>
    </html>
  );
}
