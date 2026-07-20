import { NoticePage } from "@/components/notices/notice-list";

// 공지 데이터는 클라이언트 상태(NoticeProvider)에 있으므로 서버에서 조회할 것이 없다.
export default function NoticesPage() {
  return <NoticePage />;
}
