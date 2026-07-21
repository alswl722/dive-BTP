"use client";

// 우측 하단 플로팅 FAB(챗봇·메모) 조율. 둘 다 열리면 우측 하단에서 겹치므로,
// 챗봇이 열렸는지를 공유해 메모 패널을 왼쪽으로 밀어 둘 다 보이게 한다.
import { createContext, useContext, useState, type ReactNode } from "react";

interface FabStateValue {
  chatbotOpen: boolean;
  setChatbotOpen: (open: boolean) => void;
}

const FabStateContext = createContext<FabStateValue>({ chatbotOpen: false, setChatbotOpen: () => {} });

export function FabStateProvider({ children }: { children: ReactNode }) {
  const [chatbotOpen, setChatbotOpen] = useState(false);
  return (
    <FabStateContext.Provider value={{ chatbotOpen, setChatbotOpen }}>{children}</FabStateContext.Provider>
  );
}

export const useFabState = () => useContext(FabStateContext);
