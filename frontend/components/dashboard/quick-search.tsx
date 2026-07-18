"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function QuickSearch() {
  const [q, setQ] = useState("");
  const router = useRouter();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/companies?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form onSubmit={onSubmit} className="relative">
      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="기업명, 사업자번호, 업종 입력..."
        className="w-full rounded-lg border bg-subtle py-3 pl-12 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-ring/40"
      />
    </form>
  );
}
