"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Inbox, Lock } from "lucide-react";
import { CompaniesExplorer } from "@/components/companies/companies-explorer";
import { Card } from "@/components/ui/card";
import { useAdminState } from "@/lib/admin-state";
import { useAuth, isAdmin } from "@/lib/auth";
import { programKey } from "@/lib/program-progress";
import type { Company, Program } from "@/types";

/**
 * 기업 선정 진입 분기.
 *  - 사업 미선택: 내가 심사할 수 있는(배정받은) 사업 중 첫 번째로 자동 이동
 *    (카드 목록에서 고르게 하지 않고 바로 심사 화면으로 진입 — 사업이 없으면 안내만 표시)
 *  - 사업 선택(?program=): 그 사업의 신청 기업 심사 화면
 *
 * 배정되지 않은 사업을 주소로 직접 열면 차단한다 — 목록에서 숨기는 것만으로는
 * 접근 제어가 되지 않기 때문(링크 공유·북마크로 우회 가능).
 */
export function CompaniesEntry({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedKey = searchParams.get("program");
  const { assigns } = useAdminState();
  const { user } = useAuth();
  const admin = isAdmin(user);

  const myPrograms = useMemo(
    () =>
      programs
        .filter((p) => p.applicantCount > 0 && (admin || assigns[programKey(p)] === user?.username))
        .sort((a, b) => b.year - a.year || ((a.name ?? "") < (b.name ?? "") ? -1 : (a.name ?? "") > (b.name ?? "") ? 1 : 0)),
    [programs, assigns, admin, user]
  );

  const firstProgramKey = myPrograms[0] ? programKey(myPrograms[0]) : null;

  useEffect(() => {
    if (!selectedKey && firstProgramKey) {
      router.replace(`/companies?program=${firstProgramKey}`);
    }
  }, [selectedKey, firstProgramKey, router]);

  if (!selectedKey) {
    if (!firstProgramKey) {
      return (
        <div className="mx-auto max-w-2xl">
          <Card className="space-y-2 p-8 text-center">
            <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="text-[13px] font-medium">배정된 지원사업이 없습니다.</p>
            <p className="text-[12px] text-muted-foreground">
              관리자가 사업을 배정하면 심사를 시작할 수 있습니다.
              <br />
              전체 지원사업 정보는{" "}
              <Link href="/programs" className="text-primary hover:underline">
                지원 사업
              </Link>{" "}
              화면에서 확인할 수 있습니다.
            </p>
          </Card>
        </div>
      );
    }
    return null; // 자동 이동 중 — 카드 목록을 보여주지 않고 바로 리다이렉트
  }

  const allowed = admin || assigns[selectedKey] === user?.username;
  if (!allowed) {
    const program = programs.find((p) => programKey(p) === selectedKey);
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="space-y-2 p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="text-[13px] font-medium">배정되지 않은 지원사업입니다.</p>
          <p className="text-[12px] text-muted-foreground">
            {program?.name ?? selectedKey} 심사 권한이 없습니다. 배정이 필요하면 관리자에게 요청하세요.
          </p>
          <Link
            href="/companies"
            className="inline-flex items-center gap-1 pt-1 text-[12px] text-primary hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 내 지원사업 목록
          </Link>
        </Card>
      </div>
    );
  }

  return <CompaniesExplorer companies={companies} programs={programs} />;
}
