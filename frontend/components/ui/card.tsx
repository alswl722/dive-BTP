import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // 보더 대신 그림자로만 구분 — 옅은 회색 캔버스 위에 흰 카드가 뜨는 톤(토스/뱅크샐러드류)
  return <div className={cn("rounded-xl bg-card text-card-foreground shadow-card", className)} {...props} />;
}
