"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Info, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import type { Company, Tech } from "@/types";
import { cn } from "@/lib/utils";
// 임계값 단일 출처 — 심사 요약과 같은 기준으로 판정해야 화면끼리 어긋나지 않는다.
import { PATENT_LAPSE_ALERT, STALE_PATENT_YEARS } from "@/lib/review-summary";

/** 동종 대비 백분위를 담당자 언어로. 표본 부족이면 기준을 함께 알린다. */
function rankText(p: number | null | undefined, basis: string | null | undefined): string | null {
  if (p == null) return null;
  const top = Math.max(1, Math.round(100 - p));
  const scope = basis === "전체fallback" ? "전체" : "동종";
  return `${scope} 상위 ${top}%`;
}

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | null | undefined) => (v == null ? "—" : `${v}`);
const yr = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}년`);

export function RndTab({ company }: { company: Company }) {
  const tech = company.tech;
  const basis = tech?.scores.백분위기준;

  return (
    <div className="space-y-6">
      {/* 기술 분야 — "얼마나"가 아니라 "어느 분야에서" */}
      {tech && <DomainSection domain={tech.domain} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="특허 등록"
          value={`${company.patents.등록 ?? 0}건`}
          sub={tech ? rankText(tech.percentiles["특허등록"], basis) ?? `전환율 ${pct(tech.patents.등록전환율)}` : undefined}
        />
        <StatCard
          label="특허 출원"
          value={`${company.patents.출원 ?? 0}건`}
          sub={tech ? rankText(tech.percentiles["특허출원"], basis) ?? "상표·디자인 제외" : "상표·디자인 제외"}
        />
        <StatCard
          label="NTIS 주관"
          value={`${company.ntis.주관 ?? 0}건`}
          sub={tech ? rankText(tech.percentiles["NTIS과제수"], basis) ?? `${num(tech.ntis.부처다양성)}개 부처` : undefined}
        />
        <StatCard label="NTIS 위탁" value={`${company.ntis.위탁 ?? 0}건`} />
      </div>
      {tech?.scores.백분위기준 === "전체fallback" && (
        <p className="-mt-3 text-[11px] text-muted-foreground">
          ※ 동종업계 표본이 부족해 전체 기업 대비로 계산했습니다.
        </p>
      )}

      {tech && (
        <>
          <PatentFunnel patents={tech.patents} />
          <TechWarnings tech={tech} />
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              label="R&D 집약도"
              value={pct(tech.rnd.집약도)}
              sub={rankText(tech.percentiles["R&D집약도"], basis) ?? "연구개발비 ÷ 매출"}
            />
            <StatCard
              label="최근 3년 출원"
              value={`${tech.patents.최근3년출원 ?? 0}건`}
              sub={`전체의 ${pct(tech.patents.최근출원비중)}`}
            />
          </div>
          <PatentDrilldown patents={tech.patentList} />
        </>
      )}

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

      {domain.분야수 != null && domain.분야수 > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          연구 분야 {domain.분야수}개
          {domain.집중도 != null && ` · 집중도 ${domain.집중도.toFixed(2)} (1에 가까울수록 단일 분야 전문)`}
        </p>
      )}
    </div>
  );
}

/** 출원 → 등록 전환. "신청만 많은 기업"과 "권리를 실제로 받는 기업"을 가른다. */
function PatentFunnel({ patents }: { patents: Tech["patents"] }) {
  const applied = patents.출원 ?? 0;
  const registered = patents.등록 ?? 0;
  if (applied === 0) return null;

  return (
    <div>
      <p className="mb-2 text-[12.5px] font-bold">
        출원 → 등록 전환 <span className="font-normal text-muted-foreground">특허의 질</span>
      </p>
      <div className="space-y-1.5 rounded-lg bg-subtle p-3.5">
        <FunnelBar label="출원" value={applied} max={applied} tone="bg-slate-300" />
        <FunnelBar label="등록" value={registered} max={applied} tone="bg-primary" />
        <p className="pt-1 text-[11px] text-muted-foreground">
          전환율 <span className="font-bold text-foreground">{pct(registered / applied)}</span>
          {patents.첫특허업력 != null && ` · 설립 후 첫 출원까지 ${yr(patents.첫특허업력)}`}
        </p>
      </div>
    </div>
  );
}

function FunnelBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-8 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-white">
        <div className={cn("h-full rounded", tone)} style={{ width: `${width}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[12px] font-bold tabular-nums">{value}</span>
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
