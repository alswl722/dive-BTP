import { Megaphone } from "lucide-react";
import { NoticeEditor } from "@/components/notices/notice-editor";

// 접근 제어는 AuthGate에서 처리(/admin 하위는 관리자만).
export default function AdminNoticesPage() {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h1 className="text-[20px] font-extrabold tracking-tight">공지사항 작성</h1>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          작성한 공지는 심사 담당자의 공지사항 화면과 메인 페이지에 즉시 표시됩니다.
        </p>
      </div>
      <NoticeEditor />
    </div>
  );
}
