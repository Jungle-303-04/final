import type {
  PodTerminalConnection,
  PodTerminalPort,
  PodTerminalTarget,
} from "./podTerminalContract";

type EndpointEvent =
  | { type: "terminal.connected"; session_id: string }
  | {
      type: "terminal.output";
      session_id: string;
      stream: "stdout" | "stderr";
      data: string;
    }
  | {
      type: "terminal.end";
      session_id: string;
      exit_code: number | null;
      reason: string;
    }
  | {
      type: "terminal.error";
      session_id: string | null;
      code: string;
      message: string;
      retryable: boolean;
    };

interface Dependencies {
  openPodTerminal(
    target: PodTerminalTarget,
    command: string,
    handlers: { onEvent: (event: EndpointEvent) => void; onFailure: (error: unknown) => void },
  ): PodTerminalConnection;
}

export function createPodTerminalAdapter(dependencies: Dependencies): PodTerminalPort {
  return {
    open(target, command, handlers) {
      return dependencies.openPodTerminal(target, command, {
        onEvent(event) {
          if (event.type === "terminal.connected") {
            handlers.onEvent({ type: "connected", sessionId: event.session_id });
          } else if (event.type === "terminal.output") {
            handlers.onEvent({
              type: "output",
              sessionId: event.session_id,
              stream: event.stream,
              data: event.data,
            });
          } else if (event.type === "terminal.end") {
            handlers.onEvent({
              type: "ended",
              sessionId: event.session_id,
              exitCode: event.exit_code,
              reason: event.reason,
            });
          } else {
            handlers.onEvent({
              type: "failed",
              sessionId: event.session_id,
              code: event.code,
              message: event.message,
              retryable: event.retryable,
            });
          }
        },
        onFailure: () => handlers.onFailure(),
      });
    },
  };
}
