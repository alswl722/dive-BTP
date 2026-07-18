"use client";

import type { ReactNode } from "react";
import { RoleProvider } from "@/lib/roles";
import { ReviewStatusProvider, UiProvider } from "@/lib/app-state";
import type { ReviewStatus } from "@/types";

export function Providers({
  initialReviewStatus,
  children,
}: {
  initialReviewStatus: Record<number, ReviewStatus>;
  children: ReactNode;
}) {
  return (
    <RoleProvider>
      <ReviewStatusProvider initial={initialReviewStatus}>
        <UiProvider>{children}</UiProvider>
      </ReviewStatusProvider>
    </RoleProvider>
  );
}
