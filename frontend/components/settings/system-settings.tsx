"use client";

import { Moon, RotateCcw, Settings, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useUi, PAGE_SIZE_OPTIONS } from "@/lib/app-state";
import { cn } from "@/lib/utils";

/**
 * 시스템 설정 — 실제로 동작하는 설정만(가짜 토글 배제). 모두 UiProvider 상태와 연결되고
 * localStorage에 영속화된다(새로고침·재접속에도 유지).
 */
export function SystemSettings() {
  const { theme, setTheme, pageSize, setPageSize, defaultWeights, setDefaultWeights } = useUi();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h1 className="text-[20px] font-extrabold tracking-tight">시스템 설정</h1>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          화면 표시 방식을 설정합니다. 변경한 설정은 이 브라우저에 저장되어 다시 접속해도 유지됩니다.
        </p>
      </div>

      {/* 표시 설정 */}
      <Card className="space-y-4 p-5">
        <p className="text-[12.5px] font-bold">표시</p>

        <Row label="테마" desc="밝은 화면과 어두운 화면을 전환합니다.">
          <Segmented
            options={[
              { value: "light", label: "라이트", icon: <Sun className="h-3.5 w-3.5" /> },
              { value: "dark", label: "다크", icon: <Moon className="h-3.5 w-3.5" /> },
            ]}
            value={theme}
            onChange={(v) => setTheme(v as "light" | "dark")}
          />
        </Row>

        <Row label="목록 페이지당 개수" desc="기업 목록 한 페이지에 표시할 기업 수입니다.">
          <Segmented
            options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: `${n}개`, icon: null }))}
            value={String(pageSize)}
            onChange={(v) => setPageSize(Number(v))}
          />
        </Row>
      </Card>

      {/* 심사 기준 */}
      <Card className="space-y-3 p-5">
        <p className="text-[12.5px] font-bold">심사 기준</p>
        <Row
          label="기본 종합점수 가중치"
          desc={
            defaultWeights
              ? "저장된 사용자 가중치로 기업 목록이 시작됩니다."
              : "시스템 기본값(재무·기술·정합성 균등)으로 시작됩니다."
          }
        >
          {defaultWeights ? (
            <button
              type="button"
              onClick={() => setDefaultWeights(null)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              기본값으로 초기화
            </button>
          ) : (
            <span className="rounded-md bg-muted px-2.5 py-1 text-[11.5px] text-muted-foreground">시스템 기본</span>
          )}
        </Row>
        <p className="text-[11px] text-muted-foreground">
          기업 선정 화면의 <b>종합 점수 가중치 조정</b>에서 &lsquo;현재 값을 기본 가중치로 저장&rsquo;하면 여기에 반영됩니다.
        </p>
      </Card>

      {/* 데이터 · 저장 */}
      <Card className="space-y-2.5 p-5">
        <p className="text-[12.5px] font-bold">데이터 · 저장</p>
        <ul className="space-y-2 text-[12px] text-muted-foreground">
          <li>
            <b className="text-foreground">표본 데이터</b> — 현재 화면은 발제 표본(비식별) 기준입니다. 업종 백분위 등 일부 지표는
            표본이 작아 전체 대비로 계산됩니다.
          </li>
          <li>
            <b className="text-foreground">심사 상태·배정·잠금·공지·설정</b> — 아직 백엔드 미연동이라 <b>이 브라우저에만</b> 저장됩니다.
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
