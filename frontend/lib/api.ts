// 타입드 데이터 클라이언트.
// NEXT_PUBLIC_API_BASE_URL 있으면 FastAPI fetch, 없으면 로컬 fixture.
// 화면 코드는 데이터 출처를 모른다(우리 parquet→DB 철학과 동일).

import type { Company, Rankings, Dashboard } from "@/types";
import companiesFixture from "./fixtures/companies.json";
import rankingsFixture from "./fixtures/rankings.json";
import dashboardFixture from "./fixtures/dashboard.json";

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
