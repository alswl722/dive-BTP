"use client";

import { LayoutGrid, List, PanelLeft, Settings, Table2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useUi } from "@/lib/app-state";
import { cn } from "@/lib/utils";

/**
 * 시스템 설정 — 실제로 동작하는 표시 설정만 둔다(가짜 토글 배제).
 * 기업 목록 기본 뷰·사이드바는 UiProvider 상태와 직접 연결. 데이터·저장 안내는 읽기 전용.
 */
export function SystemSettings() {
  const { viewMode, setViewMode, sidebarCollapsed, toggleSidebar } = useUi();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h1 className="text-[20px] font-extrabold tracking-tight">시스템 설정</h1>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">화면 표시 방식과 데이터·저장 정보를 확인합니다.</p>
      </div>

      {/* 표시 설정 — 실제 UI 상태에 즉시 반영 */}
      <Card className="space-y-4 p-5">
        <p className="text-[12.5px] font-bold">표시</p>

        <Row label="기업 목록 기본 뷰" desc="기업 선정 화면을 표 또는 보드로 표시합니다.">
          <Segmented
            options={[
              { value: "table", label: "표", icon: <Table2 className="h-3.5 w-3.5" /> },
              { value: "board", label: "보드", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
            ]}
            value={viewMode}
            onChange={(v) => setViewMode(v as "table" | "board")}
          />
        </Row>

        <Row label="사이드바" desc="왼쪽 메뉴를 펼치거나 접습니다.">
          <Segmented
            options={[
              { value: "expanded", label: "펼침", icon: <PanelLeft className="h-3.5 w-3.5" /> },
              { value: "collapsed", label: "접기", icon: <List className="h-3.5 w-3.5" /> },
            ]}
            value={sidebarCollapsed ? "collapsed" : "expanded"}
            onChange={(v) => {
              if ((v === "collapsed") !== sidebarCollapsed) toggleSidebar();
            }}
          />
        </Row>
      </Card>

      {/* 데이터 · 저장 — 심사자가 알아야 할 동작 방식(읽기 전용) */}
      <Card className="space-y-2.5 p-5">
        <p className="text-[12.5px] font-bold">데이터 · 저장</p>
        <ul className="space-y-2 text-[12px] text-muted-foreground">
          <li>
            <b className="text-foreground">표본 데이터</b> — 현재 화면은 발제 표본(비식별) 기준입니다. 업종 백분위 등 일부 지표는
            표본이 작아 전체 대비로 계산됩니다.
          </li>
          <li>
            <b className="text-foreground">심사 상태·배정·잠금·공지</b> — 아직 백엔드 미연동이라 <b>이 브라우저에만</b> 저장됩니다.
            다른 PC와 공유되지 않으며, 실 운영 시 서버로 영속화됩니다.
          </li>
          <li>
            <b className="text-foreground">기준 시점</b> — D-day·진행 상태는 실제 오늘이 아니라 표본 지원이력의 최신 연도를
            기준일로 씁니다.
          </li>
        </ul>
      </Card>

      <Card className="flex items-center justify-between p-5 text-[12px] text-muted-foreground">
        <span>부산테크노파크 기업 심사 지원 도구</span>
        <span className="tabular-nums">데모 버전</span>
      </Card>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; icon: React.ReactNode }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex shrink-0 rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
