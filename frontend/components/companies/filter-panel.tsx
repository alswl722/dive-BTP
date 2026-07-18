"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AXES, type Axis, type Company } from "@/types";
import { cn } from "@/lib/utils";
import { CERT_ABBREV } from "@/lib/constants";
import { defaultFilters, type CompanyFilters } from "@/lib/company-filters";

const AXIS_TEXT_COLOR: Record<Axis, string> = {
  성장성: "text-axis-growth",
  수익성: "text-axis-profit",
  효율성: "text-axis-efficiency",
  안정성: "text-axis-stability",
};

export function FilterPanel({
  companies,
  filteredCount,
  filters,
  onChange,
}: {
  companies: Company[];
  filteredCount: number;
  filters: CompanyFilters;
  onChange: (next: CompanyFilters) => void;
}) {
  const industries = Array.from(new Set(companies.map((c) => c.industry).filter((v): v is string => !!v))).sort();
  const certKeys = Object.keys(companies[0]?.certifications ?? {});

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <div className="sticky top-6 flex max-h-[calc(100vh-100px)] w-[216px] shrink-0 flex-col gap-1 overflow-y-auto rounded-xl bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-bold">
          필터 <span className="font-normal text-muted-foreground">{filteredCount}/{companies.length}</span>
        </span>
        <button onClick={() => onChange(defaultFilters())} className="text-[11.5px] text-primary hover:underline">
          초기화
        </button>
      </div>

      <AccordionSection title="업종" defaultOpen>
        <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
          {industries.map((ind) => (
            <label key={ind} className="flex cursor-pointer items-center gap-2 text-[11.5px]">
              <input
                type="checkbox"
                checked={filters.industries.includes(ind)}
                onChange={() => onChange({ ...filters, industries: toggle(filters.industries, ind) })}
                className="h-3.5 w-3.5 shrink-0 accent-primary"
              />
              <span className="truncate">{ind}</span>
            </label>
          ))}
        </div>
      </AccordionSection>

      <AccordionSection title="종합점수 (최소)" defaultOpen>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={filters.minOverall}
            onChange={(e) => onChange({ ...filters, minOverall: Number(e.target.value) })}
            className="w-full accent-primary"
          />
          <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{filters.minOverall}</span>
        </div>
      </AccordionSection>

      <AccordionSection title="축별 최소 점수">
        <div className="space-y-3">
          {AXES.map((axis) => (
            <div key={axis} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className={AXIS_TEXT_COLOR[axis]}>{axis}</span>
                <span className="tabular-nums text-muted-foreground">{filters.minAxis[axis]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={filters.minAxis[axis]}
                onChange={(e) => onChange({ ...filters, minAxis: { ...filters.minAxis, [axis]: Number(e.target.value) } })}
                className="w-full accent-primary"
              />
            </div>
          ))}
        </div>
      </AccordionSection>

      <AccordionSection title="인증">
        <div className="flex flex-wrap gap-1.5">
          {certKeys.map((cert) => (
            <ChipToggle key={cert} active={filters.certs.includes(cert)} onClick={() => onChange({ ...filters, certs: toggle(filters.certs, cert) })}>
              {CERT_ABBREV[cert] ?? cert}
            </ChipToggle>
          ))}
        </div>
      </AccordionSection>

      <AccordionSection title="지원 이력">
        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          최소 지원연도수
          <input
            type="number"
            min={0}
            value={filters.minSupportYears}
            onChange={(e) => onChange({ ...filters, minSupportYears: Math.max(0, Number(e.target.value)) })}
            className="w-16 rounded-md border bg-subtle px-2 py-1 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
      </AccordionSection>

      <AccordionSection title="데이터 품질">
        <label className="flex cursor-pointer items-center gap-2 text-[11.5px]">
          <input
            type="checkbox"
            checked={filters.excludeQualityIssues}
            onChange={(e) => onChange({ ...filters, excludeQualityIssues: e.target.checked, qualityIssueOnly: false })}
            className="h-3.5 w-3.5 accent-primary"
          />
          데이터 품질 이슈 제외
        </label>
      </AccordionSection>
    </div>
  );
}

function AccordionSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b py-2.5 last:border-0">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-[12px] font-medium">
        {title}
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        active ? "bg-info-bg text-info" : "bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
