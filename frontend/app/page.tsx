import Link from "next/link";
import { AlertTriangle, ShieldAlert, Clock, ArrowRight } from "lucide-react";
import { listCompanies, listPrograms, getDashboard } from "@/lib/api";
import type { Program } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleGreeting } from "@/components/dashboard/role-greeting";
import { QuickSearch } from "@/components/dashboard/quick-search";
import { RecentlyViewedPanel } from "@/components/dashboard/recently-viewed-panel";
import { formatKRW, daysUntil, formatDday, cn } from "@/lib/utils";
import { latestSupportYear, recentSelectionCount, DUPLICATE_RISK_THRESHOLD } from "@/lib/duplicate-risk";
import { dashboardReferenceDate, activePrograms, programApplicantIds } from "@/lib/program-progress";

export default async function DashboardPage() {
  const [companies, programs, dash] = await Promise.all([listCompanies(), listPrograms(), getDashboard()]);

  const latestYear = latestSupportYear(companies);
  const dupRiskCompanies = companies.filter((c) => recentSelectionCount(c, latestYear) >= DUPLICATE_RISK_THRESHOLD);
  const qualityIssueCompanies = companies.filter((c) => !c.dataQuality.ok);

  const referenceDate = dashboardReferenceDate(programs);
  const ongoing = activePrograms(programs, referenceDate)
    .map((p) => {
      const applicantIds = programApplicantIds(p, companies);
      const reviewedCount = applicantIds.filter((id) => companies.find((c) => c.id === id)?.reviewStatus !== "후보").length;
      return { program: p, applicantIds, reviewedCount };
    })
    .sort((a, b) => (daysUntil(a.program.endDate, referenceDate) ?? 0) - (daysUntil(b.program.endDate, referenceDate) ?? 0))
    .slice(0, 4);

  const upcoming = programs
    .filter((p) => p.applicantCount > 0 && p.endDate)
    .map((p) => ({ program: p, dday: daysUntil(p.endDate, referenceDate) ?? 0 }))
    .filter((x) => x.dday >= 0)
    .sort((a, b) => a.dday - b.dday)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-extrabold tracking-tight">
          안녕하세요, <RoleGreeting />님
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          이번 사업 총 지원 기업은 {dash.totalCompanies}개, 진행 중인 사업은 {ongoing.length}건입니다.
          <span className="ml-1 text-[11px]">(기준일 {formatDate(referenceDate)} · 표본 지원이력 최신연도 기준)</span>
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <AttentionCard
              href="/companies?dupRisk=1"
              icon={ShieldAlert}
              tone="orange"
              title="최근 3년 3건 이상 수혜"
              count={dupRiskCompanies.length}
              hint={`${latestYear - 2}~${latestYear}년 기준 · 중복수혜 의심`}
            />
            <AttentionCard
              href="/companies?qualityIssue=1"
              icon={AlertTriangle}
              tone="warn"
              title="데이터 품질 이슈"
              count={qualityIssueCompanies.length}
              hint="재무지표 결측 등"
            />
          </div>

          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">진행 중인 심사</h2>
              <Link href="/programs" className="text-[12px] text-primary hover:underline">
                전체 사업 보기
              </Link>
            </div>
            {ongoing.length === 0 ? (
              <Card className="p-6 text-center text-[13px] text-muted-foreground">
                기준일 기준으로 진행 중인 사업이 없습니다.
              </Card>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2">
                {ongoing.map(({ program, applicantIds, reviewedCount }) => (
                  <OngoingProgramCard
                    key={`${program.year}:${program.programCode}`}
                    program={program}
                    referenceDate={referenceDate}
                    applicantCount={applicantIds.length}
                    reviewedCount={reviewedCount}
                  />
                ))}
              </div>
            )}
          </div>

          <Card className="p-5">
            <p className="mb-2.5 text-[13px] font-bold">기업 빠른 검색</p>
            <QuickSearch />
            {companies[0] && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                예시: &quot;{companies[0].name}&quot;, &quot;{companies[0].industryCode}&quot;, &quot;{companies[0].industry}&quot;
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="mb-3 text-[13px] font-bold">마감 임박 사업</p>
            {upcoming.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">마감 예정 사업이 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {upcoming.map(({ program, dday }) => (
                  <Link
                    key={`${program.year}:${program.programCode}`}
                    href={`/programs?year=${program.year}`}
                    className="flex items-center gap-2.5 rounded-md px-1.5 py-2 hover:bg-muted"
                  >
                    <DdayChip dday={dday} />
                    <span className="flex-1 truncate text-[12.5px]">{program.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{program.endDate}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <p className="mb-3 text-[13px] font-bold">최근 조회 기업</p>
            <RecentlyViewedPanel companies={companies} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function AttentionCard({
  href,
  icon: Icon,
  tone,
  title,
  count,
  hint,
}: {
  href: string;
  icon: typeof AlertTriangle;
  tone: "orange" | "warn";
  title: string;
  count: number;
  hint: string;
}) {
  const toneClass = tone === "orange" ? "bg-orangeTone-bg text-orangeTone" : "bg-warn-bg text-[hsl(30_75%_38%)]";
  return (
    <Link href={href}>
      <Card className="flex items-center gap-4 p-5 transition-shadow hover:shadow-modal">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-muted-foreground">{title}</p>
          <p className="text-[19px] font-extrabold tabular-nums">
            {count}
            <span className="ml-0.5 text-[13px] font-normal text-muted-foreground">개</span>
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  );
}

function DdayChip({ dday }: { dday: number }) {
  const tone = dday <= 7 ? "bg-bad-bg text-bad" : dday <= 30 ? "bg-info-bg text-info" : "bg-good-bg text-good";
  return (
    <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums", tone)}>
      {formatDday(dday)}
    </span>
  );
}

function OngoingProgramCard({
  program,
  referenceDate,
  applicantCount,
  reviewedCount,
}: {
  program: Program;
  referenceDate: Date;
  applicantCount: number;
  reviewedCount: number;
}) {
  const dday = daysUntil(program.endDate, referenceDate) ?? 0;
  const reviewPct = applicantCount ? Math.round((reviewedCount / applicantCount) * 100) : 0;
  const selectedPct = applicantCount ? Math.round((program.selectedCount / applicantCount) * 100) : 0;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <DdayChip dday={dday} />
        <Badge variant="info">{program.businessType ?? "기타"}</Badge>
      </div>
      <p className="text-[13.5px] font-bold leading-snug">{program.name}</p>
      <p className="text-[11.5px] text-muted-foreground">
        {reviewedCount}/{applicantCount}개 심사완료 · 선정 {program.selectedCount}건 · 미검토 {applicantCount - reviewedCount}건
      </p>
      <div className="space-y-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-info" style={{ width: `${reviewPct}%` }} />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-good" style={{ width: `${selectedPct}%` }} />
        </div>
      </div>
      <Link
        href={`/companies?program=${program.year}:${program.programCode}`}
        className="block rounded-md bg-primary py-1.5 text-center text-[12px] font-medium text-primary-foreground hover:opacity-90"
      >
        이어서 심사하기
      </Link>
    </Card>
  );
}
