export interface PodTerminalTarget {
  workspaceId: string;
  clusterId: string;
  namespace: string;
  pod: string;
  container: string;
}

export type PodTerminalEvent =
  | { type: "connected"; sessionId: string }
  | { type: "output"; sessionId: string; stream: "stdout" | "stderr"; data: string }
  | { type: "ended"; sessionId: string; exitCode: number | null; reason: string }
  | { type: "failed"; sessionId: string | null; code: string; message: string; retryable: boolean };

export interface PodTerminalConnection {
  sendInput(data: string): void;
  close(): void;
}

export interface PodTerminalPort {
  open(
    target: PodTerminalTarget,
    command: string,
    handlers: { onEvent: (event: PodTerminalEvent) => void; onFailure: () => void },
  ): PodTerminalConnection;
}

export const EMPTY_POD_TERMINAL_PORT: PodTerminalPort = {
  open() {
    throw new Error("Pod terminal is not configured");
  },
};
