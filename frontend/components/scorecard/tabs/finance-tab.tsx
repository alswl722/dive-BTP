import { AxisSignals } from "@/components/scorecard/axis-signals";
import { FinanceScorecard } from "@/components/scorecard/finance-scorecard";
import type { Company } from "@/types";

export function FinanceTab({ company, latestYear }: { company: Company; latestYear: number }) {
  return (
    <div className="space-y-4">
      <AxisSignals company={company} latestYear={latestYear} axis="재무" />
      <FinanceScorecard company={company} />
    </div>
  );
}
