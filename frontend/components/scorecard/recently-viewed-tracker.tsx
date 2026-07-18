"use client";

import { useEffect } from "react";
import { pushRecentlyViewed } from "@/lib/recently-viewed";

export function RecentlyViewedTracker({ companyId }: { companyId: number }) {
  useEffect(() => {
    pushRecentlyViewed(companyId);
  }, [companyId]);
  return null;
}
