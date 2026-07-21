"use client";

import type { ReactNode } from "react";
import { RoleProvider } from "@/lib/roles";
import { AuthProvider } from "@/lib/auth";
import { AdminStateProvider } from "@/lib/admin-state";
import { NoticeProvider } from "@/lib/notices";
import { ReviewStatusProvider, UiProvider } from "@/lib/app-state";
import { NotesDataProvider } from "@/lib/notes-data";
import type { Company, Note, Program, ReviewStatus } from "@/types";

export function Providers({
  initialReviewStatus,
  notesData,
  children,
}: {
  initialReviewStatus: Record<number, ReviewStatus>;
  notesData: { companies: Company[]; programs: Program[]; initialNotes: Note[] };
  children: ReactNode;
}) {
  return (
    <AuthProvider>
      <RoleProvider>
        <ReviewStatusProvider initial={initialReviewStatus}>
          <AdminStateProvider>
            <NoticeProvider>
              <NotesDataProvider value={notesData}>
                <UiProvider>{children}</UiProvider>
              </NotesDataProvider>
            </NoticeProvider>
          </AdminStateProvider>
        </ReviewStatusProvider>
      </RoleProvider>
    </AuthProvider>
  );
}
