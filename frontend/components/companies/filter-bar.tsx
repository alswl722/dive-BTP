"use client";

import { useMemo } from "react";
import type { Company } from "@/types";
import { cn } from "@/lib/utils";
import { CERT_ABBREV } from "@/lib/constants";
import type { CompanyFilters } from "@/lib/company-filters";

/** 값이 몇 개 안 되는 필터(업종/인증/품질)는 지원사업 페이지처럼 가로 칩 그룹으로 항상 노출.
 *  연속값 필터(점수 슬라이더 등)는 AdvancedFilterPopover로 분리돼 있다. */
export function FilterBar({
  companies,
  filters,
  onChange,
}: {
  companies: Company[];
  filters: CompanyFilters;
  onChange: (next: CompanyFilters) => void;
}) {
  const industries = useMemo(
    () => Array.from(new Set(companies.map((c) => c.industry).filter((v): v is string => !!v))).sort(),
    [companies]
  );
  const certKeys = Object.keys(companies[0]?.certifications ?? {});

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ChipGroup label="업종">
        {industries.map((ind) => (
          <ChipToggle
            key={ind}
            active={filters.industries.includes(ind)}
            onClick={() => onChange({ ...filters, industries: toggle(filters.industries, ind) })}
          >
            {ind}
          </ChipToggle>
        ))}
      </ChipGroup>

      <ChipGroup label="인증">
        {certKeys.map((cert) => (
          <ChipToggle
            key={cert}
            active={filters.certs.includes(cert)}
            onClick={() => onChange({ ...filters, certs: toggle(filters.certs, cert) })}
          >
            {CERT_ABBREV[cert] ?? cert}
          </ChipToggle>
        ))}
      </ChipGroup>

      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
        <input
          type="checkbox"
          checked={filters.excludeQualityIssues}
          onChange={(e) => onChange({ ...filters, excludeQualityIssues: e.target.checked, qualityIssueOnly: false })}
          className="h-3.5 w-3.5 accent-primary"
        />
        데이터 품질 이슈 제외
      </label>
    </div>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-[11.5px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
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
