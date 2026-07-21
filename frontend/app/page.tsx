import Link from "next/link";
import { listCompanies, listPrograms, getDashboard } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleGreeting } from "@/components/dashboard/role-greeting";
import { RecentlyViewedPanel } from "@/components/dashboard/recently-viewed-panel";
import { NoticeList } from "@/components/notices/notice-list";
import { OngoingReviews } from "@/components/dashboard/ongoing-reviews";
import { daysUntil, formatDday, cn } from "@/lib/utils";
import { dashboardReferenceDate, activePrograms, programApplicantIds } from "@/lib/program-progress";

export default async function DashboardPage() {
  const [companies, programs, dash] = await Promise.all([listCompanies(), listPrograms(), getDashboard()]);

  const referenceDate = dashboardReferenceDate(programs);
  // 배정 여부는 클라이언트(localStorage)에만 있으므로 여기서는 거르지 않는다 —
  // 심사 대상 사업 전체의 행을 만들어 넘기고, 내 배정 건만 고르는 일은 OngoingReviews가 한다.
  // (진행중만 넘기면 배정받은 '완료' 사업이 메인에서 사라져 기업 선정 화면과 어긋난다)
  // 심사완료/선정 카운트는 사업 단위 리뷰 상태(useReviewStatus)가 있어야 정확하다 —
  // 그 상태는 클라이언트 컨텍스트에만 있으므로 여기서는 applicantCount만 계산하고
  // 나머지는 OngoingReviews(클라이언트)가 companies를 받아 사업별로 직접 센다.
  const ongoing = programs
    .filter((p) => p.applicantCount > 0)
    .map((p) => ({ program: p, applicantCount: programApplicantIds(p, companies).length }))
    .sort((a, b) => (daysUntil(a.program.endDate, referenceDate) ?? 0) - (daysUntil(b.program.endDate, referenceDate) ?? 0));

  const activeCount = activePrograms(programs, referenceDate).length;

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
          이번 사업 총 지원 기업은 {dash.totalCompanies}개, 진행 중인 사업은 {activeCount}건입니다.
          <span className="ml-1 text-[11px]">(기준일 {formatDate(referenceDate)} · 표본 지원이력 최신연도 기준)</span>
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">진행 중인 심사</h2>
              <Link href="/programs" className="text-[12px] text-primary hover:underline">
                전체 사업 보기
              </Link>
            </div>
            {/* 배정 필터는 클라이언트(sessionStorage)에서 — 서버는 행만 계산한다 */}
            <OngoingReviews rows={ongoing} companies={companies} referenceDate={formatDate(referenceDate)} />
          </div>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-bold">공지사항</p>
              <Link href="/notices" className="text-[11.5px] text-primary hover:underline">
                전체 보기
              </Link>
            </div>
            <NoticeList compact limit={3} />
          </Card>

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

function DdayChip({ dday }: { dday: number }) {
  const tone = dday <= 7 ? "bg-bad-bg text-bad" : dday <= 30 ? "bg-info-bg text-info" : "bg-good-bg text-good";
  return (
    <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums", tone)}>
      {formatDday(dday)}
    </span>
  );
}
