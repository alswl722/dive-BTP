import { cn } from "@/lib/utils";

export function StatCard({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={cn("rounded-lg bg-subtle p-3.5", className)}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[17px] font-extrabold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
