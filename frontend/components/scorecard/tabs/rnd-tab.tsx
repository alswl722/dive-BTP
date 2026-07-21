"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Info, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import type { Company, Tech } from "@/types";
import { cn, formatKRW } from "@/lib/utils";
// 임계값 단일 출처 — 심사 요약과 같은 기준으로 판정해야 화면끼리 어긋나지 않는다.
import { PATENT_LAPSE_ALERT, STALE_PATENT_YEARS } from "@/lib/review-summary";

/** 동종 대비 백분위를 담당자 언어로. 표본 부족이면 '전체' 기준으로 자연스럽게 표기. */
function rankText(p: number | null | undefined, basis: string | null | undefined): string | null {
  if (p == null) return null;
  const top = Math.max(1, Math.round(100 - p));
  const scope = basis === "전체fallback" ? "전체" : "동종";
  return `${scope} 상위 ${top}%`;
}

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** 정부연구비는 단위가 '원'(재무는 천원). formatKRW는 천원 입력이라 /1000으로 맞춘다. */
function govFunding(won: number | null | undefined): string {
  if (won == null) return "—";
  if (won === 0) return "0원";
  return formatKRW(won / 1000);
}

/** R&D 집약도 추세(기울기) → 담당자 언어. 미미한 변동은 신호로 보지 않는다. */
function intensityTrend(slope: number | null | undefined): string | null {
  if (slope == null || Math.abs(slope) < 0.02) return null;
  return slope > 0 ? "투자 확대 추세" : "투자 축소 추세";
}

export function RndTab({ company }: { company: Company }) {
  const tech = company.tech;
  const basis = tech?.scores.백분위기준;
  const applied = tech?.patents.출원 ?? 0;
  const registered = tech?.patents.등록 ?? 0;

  return (
    <div className="space-y-5">
      {/* 기술 분야 — "얼마나"가 아니라 "어느 분야에서" */}
      {tech && <DomainSection domain={tech.domain} />}

      {/* 특허 실적 — 규모(등록·출원)와 질·활동(전환율·최근출원)을 한 묶음으로 */}
      <section className="space-y-2">
        <SectionLabel>특허</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="특허 등록"
            value={`${company.patents.등록 ?? 0}건`}
            sub={rankText(tech?.percentiles["특허등록"], basis) ?? undefined}
          />
          <StatCard
            label="특허 출원"
            value={`${company.patents.출원 ?? 0}건`}
            sub={rankText(tech?.percentiles["특허출원"], basis) ?? undefined}
          />
          <StatCard
            label="특허 전환율"
            value={pct(tech?.patents.등록전환율)}
            sub={applied > 0 ? `출원 ${applied} · 등록 ${registered}` : undefined}
          />
          <StatCard
            label="최근 3년 출원"
            value={`${tech?.patents.최근3년출원 ?? 0}건`}
            sub={tech?.patents.최근출원비중 != null ? `전체의 ${pct(tech.patents.최근출원비중)}` : undefined}
          />
        </div>
      </section>

      {/* 정부 R&D·투자 — 정부가 이 기업에 실제로 투입한 R&D 규모와 자체 투자 강도 */}
      {tech && (
        <section className="space-y-2">
          <SectionLabel>정부 R&D · 투자</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="NTIS 주관"
              value={`${tech.ntis.주관과제수 ?? 0}건`}
              sub={rankText(tech.percentiles["NTIS과제수"], basis) ?? (tech.ntis.부처다양성 != null ? `${tech.ntis.부처다양성}개 부처` : undefined)}
            />
            <StatCard label="NTIS 위탁" value={`${tech.ntis.위탁과제수 ?? 0}건`} sub="공동연구 참여" />
            <StatCard
              label="누적 정부연구비"
              value={govFunding(tech.ntis.정부연구비_원)}
              sub="정부 R&D 수주 총액"
            />
            <StatCard
              label="R&D 집약도"
              value={pct(tech.rnd.집약도)}
              sub={intensityTrend(tech.rnd.집약도추세) ?? rankText(tech.percentiles["R&D집약도"], basis) ?? "연구개발비 ÷ 매출"}
            />
          </div>
        </section>
      )}

      {tech && <TechWarnings tech={tech} />}
      {tech && <PatentDrilldown patents={tech.patentList} />}

      {/* 인증 — 실체와 교차해서 본다 */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[12.5px] font-bold">인증 취득현황</p>
          {tech?.certification.실체괴리 && (
            <Badge variant="bad" className="text-[11px]">서류 vs 실체 불일치</Badge>
          )}
        </div>
        <div className="divide-y rounded-lg border">
          {Object.entries(company.certifications).map(([k, has]) => (
            <div key={k} className="flex items-center justify-between px-3.5 py-2.5 text-[12.5px]">
              <span>{k}</span>
              <span className={cn("flex items-center gap-1 font-medium", has ? "text-good" : "text-muted-foreground")}>
                {has ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {has ? "보유" : "미보유"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {!company.dataQuality.ok && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3.5 py-3 text-[12px] text-[hsl(30_75%_38%)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium">누락 데이터 {company.dataQuality.missing.length}건</p>
            <p className="mt-0.5 text-[11.5px] opacity-90">{company.dataQuality.missing.join(", ")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** 지표 묶음 구분용 소제목 — 숫자 카드가 나열될 때 무엇에 대한 값인지 한눈에 잡아준다. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

/** 기술 분야 · 정책 정렬. 추정으로 채운 경우 반드시 표기(확정값으로 오인 방지). */
function DomainSection({ domain }: { domain: Tech["domain"] }) {
  const estimated = domain.출처 === "KSIC추정";
  return (
    <div className="rounded-lg border p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-bold">{domain.주력기술분야 ?? "기술분야 미상"}</span>
        {domain.기술수준등급 && <Badge variant="info" className="text-[11px]">{domain.기술수준등급}</Badge>}
        {estimated && <Badge variant="slate" className="text-[11px]">업종 기반 추정</Badge>}
      </div>

      {domain.국가전략기술.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">국가전략기술</span>
          {domain.국가전략기술.map((s) => (
            <Badge key={s} variant="good" className="text-[11px]">{s}</Badge>
          ))}
        </div>
      )}

      {domain.btp중점사업.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">부산TP 중점사업</span>
          {domain.btp중점사업.map((s) => (
            <Badge key={s} variant="secondary" className="text-[11px]">{s}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 특허 원장 드릴다운 — "등록 N건"의 근거를 담당자가 직접 확인.
 *
 * 집계 숫자만 보여주면 신뢰하기 어렵다. 원본 목록을 펼쳐 볼 수 있어야 하고,
 * 화면 숫자와 같은 기준(기술 IP만)으로 필터돼 있어야 수가 어긋나지 않는다.
 */
function PatentDrilldown({ patents }: { patents: Tech["patentList"] }) {
  const [open, setOpen] = useState(false);
  if (!patents || patents.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-[12.5px] transition-colors hover:bg-muted/50"
      >
        <span className="font-bold">
          특허 목록 <span className="font-normal text-muted-foreground">{patents.length}건 · 근거 확인</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b bg-subtle px-3 py-2 text-[11px] font-medium text-muted-foreground">
            <span>종류 · 상태</span>
            <span className="text-right">출원일</span>
            <span className="text-right">등록일</span>
            <span className="text-right">권리</span>
          </div>
          <div className="max-h-[280px] divide-y overflow-y-auto">
            {patents.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2 text-[11.5px]">
                <span className="flex items-center gap-1.5">
                  <span>{p.type}</span>
                  <Badge variant={p.status === "등록" ? "good" : "secondary"} className="text-[10px]">
                    {p.status}
                  </Badge>
                </span>
                <span className="text-right tabular-nums text-muted-foreground">{p.applied ?? "—"}</span>
                <span className="text-right tabular-nums text-muted-foreground">{p.registered ?? "—"}</span>
                <span className={cn("text-right text-[10.5px]", p.valid === false ? "text-bad" : "text-muted-foreground")}>
                  {p.status !== "등록" ? "—" : p.valid === false ? "소멸" : "유효"}
                </span>
              </div>
            ))}
          </div>
          <p className="border-t bg-subtle px-3 py-2 text-[10.5px] text-muted-foreground">
            기술 IP(특허권·실용신안)만 표시 — 상표권·디자인권은 R&amp;D 산출물이 아니라 집계·목록에서 제외됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 누적 건수만 보면 놓치는 신호들.
 * - 인증-실체 괴리: 인증은 있는데 등록특허·국가R&D가 0
 * - 활동 공백: 특허가 많아도 최근 출원이 끊겼으면 R&D가 멈춘 것
 * - 권리 소멸: 등록 특허 포기 = 연차료 미납(자금압박) 또는 기술 철수
 */
function TechWarnings({ tech }: { tech: Tech }) {
  const gap = tech.patents.활동공백년수;
  const lapse = tech.patents.소멸률;
  const warnings: { key: string; text: string; tone: "bad" | "warn" }[] = [];

  if (tech.certification.실체괴리) {
    warnings.push({
      key: "mismatch",
      tone: "bad",
      text: "핵심 인증을 보유했으나 등록 특허와 국가 R&D 실적이 모두 없습니다. 서류상 역량과 실제 실적이 어긋납니다.",
    });
  }
  if (gap != null && gap >= STALE_PATENT_YEARS) {
    warnings.push({
      key: "stale",
      tone: "warn",
      text: `마지막 특허 출원 이후 ${gap.toFixed(1)}년 경과. 누적 실적은 있으나 최근 R&D 활동이 확인되지 않습니다.`,
    });
  }
  if (lapse != null && lapse >= PATENT_LAPSE_ALERT) {
    warnings.push({
      key: "lapse",
      tone: "warn",
      text: `등록 특허의 ${pct(lapse)}가 권리 소멸 상태입니다. 연차료 미납 등 유지 부담 가능성을 확인하세요.`,
    });
  }

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w) => (
        <div
          key={w.key}
          className={cn(
            "flex items-start gap-2 rounded-lg px-3.5 py-3 text-[12px]",
            w.tone === "bad" ? "bg-bad-bg text-bad" : "bg-warn-bg text-[hsl(30_75%_38%)]"
          )}
        >
          {w.tone === "bad" ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <p>{w.text}</p>
        </div>
      ))}
    </div>
  );
}
