// 타입드 데이터 클라이언트.
// NEXT_PUBLIC_API_BASE_URL 있으면 FastAPI fetch, 없으면 로컬 fixture.
// 화면 코드는 데이터 출처를 모른다(우리 parquet→DB 철학과 동일).

import type { Company, Rankings, Dashboard, Program } from "@/types";
import companiesFixture from "./fixtures/companies.json";
import rankingsFixture from "./fixtures/rankings.json";
import dashboardFixture from "./fixtures/dashboard.json";
import programsFixture from "./fixtures/programs.json";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

const companies = companiesFixture as unknown as Company[];

async function fromApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

export async function listCompanies(): Promise<Company[]> {
  if (API_BASE) return fromApi<Company[]>("/companies");
  return companies;
}

export async function getCompany(id: number): Promise<Company | null> {
  if (API_BASE) return fromApi<Company>(`/companies/${id}`);
  return companies.find((c) => c.id === id) ?? null;
}

export async function getRankings(): Promise<Rankings> {
  if (API_BASE) return fromApi<Rankings>("/rankings");
  return rankingsFixture as unknown as Rankings;
}

export async function getDashboard(): Promise<Dashboard> {
  if (API_BASE) return fromApi<Dashboard>("/dashboard");
  return dashboardFixture as unknown as Dashboard;
}

export async function listPrograms(): Promise<Program[]> {
  if (API_BASE) return fromApi<Program[]>("/programs");
  return programsFixture as unknown as Program[];
}

/** 찜 상태(선정/보류/제외) 갱신. API_BASE 있으면 DB(company_review_status)에 영속화,
 *  없으면(fixture 모드) 호출부가 들고 있는 클라이언트 상태만 세션 내 갱신하도록 false 반환.
 *  브라우저는 NEXT_PUBLIC_API_BASE_URL(docker 네트워크 전용 호스트명)을 직접 못 찾으므로
 *  같은 오리진의 /api/review-status 라우트 핸들러(서버에서 실행)를 거친다. */
export async function updateReviewStatus(id: number, status: Company["reviewStatus"]): Promise<boolean> {
  if (!API_BASE) return false;
  const res = await fetch(`/api/review-status/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`PATCH review-status ${id} → ${res.status}`);
  return true;
}
