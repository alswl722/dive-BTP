"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { CompaniesExplorer } from "@/components/companies/companies-explorer";
import { MyPrograms } from "@/components/companies/my-programs";
import { Card } from "@/components/ui/card";
import { useAdminState } from "@/lib/admin-state";
import { useAuth, isAdmin } from "@/lib/auth";
import { programKey } from "@/lib/program-progress";
import type { Company, Program } from "@/types";

/**
 * 기업 선정 진입 분기.
 *  - 사업 미선택: 내가 심사할 수 있는(배정받은) 사업 목록
 *  - 사업 선택(?program=): 그 사업의 신청 기업 심사 화면
 *
 * 배정되지 않은 사업을 주소로 직접 열면 차단한다 — 목록에서 숨기는 것만으로는
 * 접근 제어가 되지 않기 때문(링크 공유·북마크로 우회 가능).
 */
export function CompaniesEntry({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const searchParams = useSearchParams();
  const selectedKey = searchParams.get("program");
  const { assigns } = useAdminState();
  const { user } = useAuth();
  const admin = isAdmin(user);

  if (!selectedKey) {
    return <MyPrograms companies={companies} programs={programs} />;
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
