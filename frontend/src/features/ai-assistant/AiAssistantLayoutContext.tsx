import { createContext, useContext, type ReactNode } from "react";

export interface AiAssistantLayout {
  open: boolean;
  width: number;
}

const AiAssistantLayoutContext = createContext<AiAssistantLayout>({
  open: false,
  width: 0,
});

export function AiAssistantLayoutProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AiAssistantLayout;
}) {
  return (
    <AiAssistantLayoutContext.Provider value={value}>
      {children}
    </AiAssistantLayoutContext.Provider>
  );
}

export function useAiAssistantLayout(): AiAssistantLayout {
  return useContext(AiAssistantLayoutContext);
}
