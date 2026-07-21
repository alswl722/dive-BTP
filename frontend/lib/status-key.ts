/** 심사 상태 맵 키 — 사업 단위(기업 × 사업). programKey는 "연도:사업코드".
 *  서버 컴포넌트(RootLayout)와 클라이언트(app-state) 양쪽에서 쓰므로 "use client" 밖에 둔다. */
export const statusKey = (companyId: number, programKey: string) => `${companyId}|${programKey}`;
