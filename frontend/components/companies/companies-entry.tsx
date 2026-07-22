"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CompaniesExplorer } from "@/components/companies/companies-explorer";
import { useAdminState } from "@/lib/admin-state";
import { useAuth } from "@/lib/auth";
import { canReviewProgram, programKey } from "@/lib/program-progress";
import type { Company, Program } from "@/types";

/**
 * 기업 선정 진입 분기.
 *  - 사업 미선택: 내가 심사할 수 있는(배정받은) 사업 중 첫 번째로 자동 이동
 *    (카드 목록에서 고르게 하지 않고 바로 심사 화면으로 진입). 배정된 사업이 하나도
 *    없어도 전체 사업 중 첫 번째로 이동한다 — 조회는 전 직원에게 열려 있다.
 *  - 사업 선택(?program=): 그 사업의 신청 기업 조회 화면. 배정 여부는 조회를 막지
 *    않고, CompaniesExplorer에 canReview로 전달돼 선정/제외 등 상태 변경만 잠근다
 *    (투명성 — 누구나 모든 사업의 심사 현황을 볼 수 있되, 결정은 담당자·관리자만).
 *  - q(검색어) 등 다른 쿼리는 리다이렉트 시에도 보존한다.
 */
export function CompaniesEntry({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedKey = searchParams.get("program");
  const { assigns } = useAdminState();
  const { user } = useAuth();

  const allPrograms = useMemo(
    () =>
      programs
        .filter((p) => p.applicantCount > 0)
        .sort((a, b) => b.year - a.year || ((a.name ?? "") < (b.name ?? "") ? -1 : (a.name ?? "") > (b.name ?? "") ? 1 : 0)),
    [programs]
  );
  // 자동 이동 우선순위: 내가 배정된 사업이 있으면 그중 첫 번째, 없으면 전체 사업 중 첫 번째.
  const myPrograms = useMemo(
    () => allPrograms.filter((p) => canReviewProgram(user, assigns, programKey(p))),
    [allPrograms, assigns, user]
  );
  const firstProgramKey = myPrograms[0] ? programKey(myPrograms[0]) : allPrograms[0] ? programKey(allPrograms[0]) : null;

  useEffect(() => {
    if (!selectedKey && firstProgramKey) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("program", firstProgramKey);
      router.replace(`/companies?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, firstProgramKey, router]);

  if (!selectedKey) {
    return null; // 자동 이동 중(또는 신청 이력 있는 사업이 아예 없음 — CompaniesExplorer가 안내)
  }

  return <CompaniesExplorer companies={companies} programs={programs} />;
}
