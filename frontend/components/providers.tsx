"use client";

import type { ReactNode } from "react";
import { RoleProvider } from "@/lib/roles";
import { AuthProvider } from "@/lib/auth";
import { AdminStateProvider } from "@/lib/admin-state";
import { FavoritesProvider } from "@/lib/favorites";
import { NoticeProvider } from "@/lib/notices";
import { ReviewStatusProvider, UiProvider } from "@/lib/app-state";
import { NotesDataProvider } from "@/lib/notes-data";
import { NotesStoreProvider } from "@/lib/notes-store";
import { ToastProvider } from "@/lib/toast";
import type { Company, Note, Program, ReviewStatus } from "@/types";

export function Providers({
  initialReviewStatus,
  notesData,
  children,
}: {
  initialReviewStatus: Record<string, ReviewStatus>; // key = statusKey(companyId, programKey)
  notesData: { companies: Company[]; programs: Program[]; initialNotes: Note[] };
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <AuthProvider>
        <RoleProvider>
          <ReviewStatusProvider initial={initialReviewStatus}>
            <AdminStateProvider>
              <FavoritesProvider>
                <NoticeProvider>
                  <NotesDataProvider value={notesData}>
                    <NotesStoreProvider initial={notesData.initialNotes}>
                      <UiProvider>{children}</UiProvider>
                    </NotesStoreProvider>
                  </NotesDataProvider>
                </NoticeProvider>
              </FavoritesProvider>
            </AdminStateProvider>
          </ReviewStatusProvider>
        </RoleProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
