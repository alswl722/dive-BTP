import { FinanceScorecard } from "@/components/scorecard/finance-scorecard";
import type { Company } from "@/types";

export function FinanceTab({ company }: { company: Company }) {
  return <FinanceScorecard company={company} />;
}
