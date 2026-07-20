"use client";

import type { ReactNode } from "react";
import { RoleProvider } from "@/lib/roles";
import { AuthProvider } from "@/lib/auth";
import { AdminStateProvider } from "@/lib/admin-state";
import { NoticeProvider } from "@/lib/notices";
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
            <NoticeProvider>
              <UiProvider>{children}</UiProvider>
            </NoticeProvider>
          </AdminStateProvider>
        </ReviewStatusProvider>
      </RoleProvider>
    </AuthProvider>
  );
}
