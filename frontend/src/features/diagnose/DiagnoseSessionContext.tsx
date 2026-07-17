import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { DiagnosePort } from "./diagnoseContract";

interface DiagnoseSessionValue {
  port: DiagnosePort;
  activeRunId: string | null;
  surface: "assistant" | "investigations";
  openRun(runId: string): void;
  closeRun(): void;
  showAssistant(): void;
  showInvestigations(): void;
}

const DiagnoseSessionContext = createContext<DiagnoseSessionValue | null>(null);

export function DiagnoseSessionProvider({
  children,
  port,
}: {
  children: ReactNode;
  port: DiagnosePort;
}) {
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [surface, setSurface] = useState<"assistant" | "investigations">("assistant");
  const value = useMemo<DiagnoseSessionValue>(() => ({
    port,
    activeRunId,
    surface,
    openRun: (runId) => {
      setActiveRunId(runId);
      setSurface("investigations");
    },
    closeRun: () => setActiveRunId(null),
    showAssistant: () => setSurface("assistant"),
    showInvestigations: () => setSurface("investigations"),
  }), [activeRunId, port, surface]);
  return (
    <DiagnoseSessionContext.Provider value={value}>
      {children}
    </DiagnoseSessionContext.Provider>
  );
}

export function useOptionalDiagnoseSession(): DiagnoseSessionValue | null {
  return useContext(DiagnoseSessionContext);
}
