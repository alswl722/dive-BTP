"use client";

import type { ReactNode } from "react";
import { RoleProvider } from "@/lib/roles";
import { AuthProvider } from "@/lib/auth";
import { AdminStateProvider } from "@/lib/admin-state";
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
    <AuthProvider>
      <RoleProvider>
        <ReviewStatusProvider initial={initialReviewStatus}>
          <AdminStateProvider>
            <UiProvider>{children}</UiProvider>
          </AdminStateProvider>
        </ReviewStatusProvider>
      </RoleProvider>
    </AuthProvider>
  );
}
