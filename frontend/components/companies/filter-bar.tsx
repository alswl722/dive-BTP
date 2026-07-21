"use client";

import { useMemo } from "react";
import type { Company } from "@/types";
import type { CompanyFilters } from "@/lib/company-filters";
import { MultiCombobox } from "@/components/ui/multi-combobox";

/** 업종/인증 다중선택 드롭다운. 사업 이름 콤보박스 바로 뒤, 축가중치·필터 앞에 위치한다.
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
  const industryOptions = useMemo(
    () =>
      Array.from(new Set(companies.map((c) => c.industry).filter((v): v is string => !!v)))
        .sort()
        .map((ind) => ({ value: ind, label: ind })),
    [companies]
  );
  const certOptions = useMemo(
    () => Object.keys(companies[0]?.certifications ?? {}).map((cert) => ({ value: cert, label: cert })),
    [companies]
  );

  return (
    <>
      <MultiCombobox
        options={industryOptions}
        values={filters.industries}
        onChange={(industries) => onChange({ ...filters, industries })}
        placeholder="업종"
      />

      <MultiCombobox
        options={certOptions}
        values={filters.certs}
        onChange={(certs) => onChange({ ...filters, certs })}
        placeholder="인증"
      />
    </>
  );
}
