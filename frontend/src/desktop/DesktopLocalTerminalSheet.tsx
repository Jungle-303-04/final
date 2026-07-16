import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { CircleAlert, CircleCheck, LoaderCircle, RotateCcw, TerminalSquare, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  desktopBridge,
  type DesktopLocalTerminalEvent,
} from "./desktopBridge";
import { LocalTerminalOutputBuffer } from "./localTerminalOutputBuffer";
import { usePrefersReducedMotion } from "../motion/usePrefersReducedMotion";
import { useI18n } from "../shared/i18n";
import { cn } from "../shared/lib/cn";
import { Badge } from "../shared/ui/primitives/badge";
import { Button, buttonVariants } from "../shared/ui/primitives/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../shared/ui/primitives/sheet";

type TerminalPhase = "connecting" | "connected" | "ended" | "failed";
type TerminalFailure =
  | { kind: "start" | "operation" | "native" }
  | { kind: "exit"; exitCode: number };

const DEFAULT_TERMINAL_COLUMNS = 80;
const DEFAULT_TERMINAL_ROWS = 24;

/**
 * A desktop-only local PTY surface.  The component deliberately has no HTTP,
 * WebSocket, or product-server dependency: all bytes cross the typed Tauri
 * bridge and the native process owns session lifetime.
 */
export function DesktopLocalTerminalSheet() {
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const restoreOpenerFocus = useCallback(() => {
    queueMicrotask(() => opener.current?.focus());
  }, []);
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) restoreOpenerFocus();
  }, [restoreOpenerFocus]);
  const closeSheet = useCallback(() => handleOpenChange(false), [handleOpenChange]);

  useEffect(() => {
    if (!desktopBridge.isDesktop) return;
    let disposed = false;
    void desktopBridge.capabilities()
      .then((capabilities) => {
        if (!disposed) setAvailable(capabilities.localTerminal.state === "available");
      })
      .catch(() => {
        if (!disposed) setAvailable(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  if (!available) return null;

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <Button
        aria-label={t("desktop.localTerminal.open")}
        ref={opener}
        onClick={() => setOpen(true)}
        size="icon-sm"
        title={t("desktop.localTerminal.open")}
        type="button"
        variant="ghost"
      >
        <TerminalSquare aria-hidden="true" />
      </Button>
      <SheetContent
        aria-describedby="desktop-local-terminal-description"
        className="h-[min(72svh,680px)] gap-0 p-0 sm:max-w-none"
        showCloseButton={false}
        side="bottom"
      >
        <SheetHeader className="shrink-0 border-b">
          <SheetTitle>{t("desktop.localTerminal.title")}</SheetTitle>
          <SheetDescription id="desktop-local-terminal-description">
            {t("desktop.localTerminal.description")}
          </SheetDescription>
        </SheetHeader>
        {open ? (
          <DesktopLocalTerminalSurface onClose={closeSheet} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DesktopLocalTerminalSurface({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState<TerminalPhase>("connecting");
  const [shell, setShell] = useState<string | null>(null);
  const [failure, setFailure] = useState<TerminalFailure | null>(null);

  useLayoutEffect(() => {
    const container = host.current;
    if (!container) return undefined;

    let disposed = false;
    let sessionId: string | null = null;
    const pendingEvents: DesktopLocalTerminalEvent[] = [];
    let outputBuffer: LocalTerminalOutputBuffer | null = null;
    let outputFrame: number | null = null;
    const terminal = new Terminal({
      cursorBlink: !reducedMotion,
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 5_000,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(container);
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === "keydown" && event.altKey && event.key === "Escape") {
        onClose();
        return false;
      }
      return true;
    });

    const invalidateSession = (): string | null => {
      const currentSessionId = sessionId;
      sessionId = null;
      return currentSessionId;
    };
    const fail = (nextFailure: TerminalFailure, shouldCloseNativeSession = false) => {
      const activeSessionId = invalidateSession();
      outputBuffer?.clear();
      if (shouldCloseNativeSession && activeSessionId) {
        void desktopBridge.closeLocalTerminal(activeSessionId).catch(() => undefined);
      }
      setFailure(nextFailure);
      setPhase("failed");
    };

    const dimensions = () => {
      fit.fit();
      return {
        columns: terminal.cols || DEFAULT_TERMINAL_COLUMNS,
        rows: terminal.rows || DEFAULT_TERMINAL_ROWS,
      };
    };
    const scheduleOutputFlush = () => {
      if (outputFrame !== null || !outputBuffer?.hasPendingOutput) return;
      outputFrame = requestAnimationFrame(() => {
        outputFrame = null;
        const activeSessionId = sessionId;
        const batch = outputBuffer?.takeFrame();
        if (!activeSessionId || !batch) return;
        terminal.write(batch.data, () => {
          if (disposed || sessionId !== activeSessionId) return;
          void desktopBridge.acknowledgeLocalTerminalOutput({
            sessionId: activeSessionId,
            byteLength: batch.byteLength,
          }).catch(() => {
            if (!disposed) fail({ kind: "operation" }, true);
          });
        });
        scheduleOutputFlush();
      });
    };
    const enqueueOutput = (event: Extract<DesktopLocalTerminalEvent, { kind: "output" }>) => {
      if (!outputBuffer?.enqueue(event)) {
        fail({ kind: "operation" }, true);
        return;
      }
      scheduleOutputFlush();
    };
    const writeEvent = (event: DesktopLocalTerminalEvent) => {
      if (event.kind === "output") return enqueueOutput(event);
      if (event.kind === "exit") {
        invalidateSession();
        if (event.exitCode === 0) {
          setFailure(null);
          setPhase("ended");
          terminal.write(`\r\n[${t("desktop.localTerminal.ended")}]\r\n`);
        } else {
          const exitCode = safeExitCode(event.exitCode);
          setFailure({ kind: "exit", exitCode });
          setPhase("failed");
          terminal.write(`\r\n[${t("desktop.localTerminal.failed")}]\r\n`);
        }
        return;
      }
      fail({ kind: "native" });
    };
    let unlisten: () => void = () => undefined;
    const listen = async () => {
      unlisten = await desktopBridge.onLocalTerminalEvent((event) => {
        if (disposed) return;
        if (!sessionId) {
          pendingEvents.push(event);
          return;
        }
        if (event.sessionId === sessionId) writeEvent(event);
      });
      if (disposed) {
        unlisten();
      }
    };
    const inputDisposable = terminal.onData((data) => {
      if (!sessionId || disposed) return;
      void desktopBridge.sendLocalTerminalInput({ sessionId, data }).catch(() => {
        if (!disposed) {
          fail({ kind: "operation" }, true);
        }
      });
    });
    let resizeFrame: number | null = null;
    const resize = () => {
      resizeFrame = null;
      if (disposed) return;
      const next = dimensions();
      if (sessionId) {
        void desktopBridge.resizeLocalTerminal({ sessionId, ...next }).catch(() => {
          if (!disposed) {
            fail({ kind: "operation" }, true);
          }
        });
      }
    };
    const observer = new ResizeObserver(() => {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    });
    observer.observe(container);

    const start = async () => {
      try {
        await listen();
        if (disposed) return;
        const started = await desktopBridge.startLocalTerminal(dimensions());
        if (disposed) {
          await desktopBridge.closeLocalTerminal(started.sessionId).catch(() => undefined);
          return;
        }
        sessionId = started.sessionId;
        outputBuffer = new LocalTerminalOutputBuffer(
          started.outputWindowBytes,
          started.outputFrameBytes,
        );
        setShell(started.shell);
        setPhase("connected");
        terminal.focus();
        for (const event of pendingEvents.splice(0)) {
          if (event.sessionId === sessionId) writeEvent(event);
        }
        resize();
      } catch {
        if (!disposed) {
          fail({ kind: "start" }, true);
        }
      }
    };
    // React StrictMode intentionally replays effects in development. Defer
    // process creation one task so its preflight cleanup can cancel before a
    // native PTY is ever spawned.
    let startTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      startTimer = null;
      void start();
    }, 0);

    return () => {
      disposed = true;
      if (startTimer !== null) clearTimeout(startTimer);
      observer.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      if (outputFrame !== null) cancelAnimationFrame(outputFrame);
      outputBuffer?.clear();
      inputDisposable.dispose();
      unlisten();
      terminal.dispose();
      const activeSessionId = invalidateSession();
      if (activeSessionId) void desktopBridge.closeLocalTerminal(activeSessionId).catch(() => undefined);
    };
  }, [generation, onClose, reducedMotion, t]);

  const isFailed = phase === "failed";
  const failureMessage = failure ? terminalFailureMessage(failure, t) : null;
  return (
    <section aria-label={t("desktop.localTerminal.title")} className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 sm:flex-nowrap">
        <TerminalPhaseBadge phase={phase} />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {shell ? t("desktop.localTerminal.shell", { shell }) : t("desktop.localTerminal.connecting")}
        </span>
        <kbd className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {t("desktop.localTerminal.closeShortcut")}
        </kbd>
        <button
          aria-label={t("desktop.localTerminal.close")}
          aria-keyshortcuts="Alt+Escape"
          className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
          onClick={onClose}
          onPointerDown={(event) => {
            event.preventDefault();
            onClose();
          }}
          title={t("desktop.localTerminal.close")}
          type="button"
        >
          <X aria-hidden="true" />
        </button>
        {(isFailed || phase === "ended") ? (
          <Button
            onClick={() => {
              setFailure(null);
              setShell(null);
              setPhase("connecting");
              setGeneration((current) => current + 1);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcw aria-hidden="true" />
            {t("desktop.localTerminal.reconnect")}
          </Button>
        ) : null}
      </header>
      {failureMessage ? (
        <p className="shrink-0 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive" role="alert">
          {failureMessage}
        </p>
      ) : null}
      <div
        className="min-h-0 flex-1 overflow-hidden bg-background px-2 py-2 font-mono text-xs [--xterm-foreground:var(--foreground)] [&_.xterm]:h-full [&_.xterm]:w-full [&_.xterm-viewport]:!bg-background"
        data-testid="desktop-local-terminal-canvas"
        ref={host}
      />
    </section>
  );
}

function TerminalPhaseBadge({ phase }: { phase: TerminalPhase }) {
  const { t } = useI18n();
  const presentation = {
    connecting: {
      icon: <LoaderCircle aria-hidden="true" className="size-3 motion-safe:animate-spin" />,
      label: t("desktop.localTerminal.connecting"),
      variant: "outline" as const,
    },
    connected: {
      icon: <CircleCheck aria-hidden="true" className="size-3" />,
      label: t("desktop.localTerminal.connected"),
      variant: "secondary" as const,
    },
    ended: {
      icon: <TerminalSquare aria-hidden="true" className="size-3" />,
      label: t("desktop.localTerminal.ended"),
      variant: "outline" as const,
    },
    failed: {
      icon: <CircleAlert aria-hidden="true" className="size-3" />,
      label: t("desktop.localTerminal.failed"),
      variant: "destructive" as const,
    },
  }[phase];
  return (
    <Badge
      aria-live="polite"
      className={cn("shrink-0 gap-1", phase === "connecting" && "text-muted-foreground")}
      role="status"
      variant={presentation.variant}
    >
      {presentation.icon}
      {presentation.label}
    </Badge>
  );
}

function terminalFailureMessage(
  failure: TerminalFailure,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (failure.kind === "start") return t("desktop.localTerminal.failure.start");
  if (failure.kind === "operation") return t("desktop.localTerminal.failure.operation");
  if (failure.kind === "native") return t("desktop.localTerminal.failure.native");
  if (failure.kind === "exit") {
    return t("desktop.localTerminal.failure.exit", { exitCode: failure.exitCode });
  }
  return t("desktop.localTerminal.failure.native");
}

function safeExitCode(value: number): number {
  return Number.isInteger(value) && value > 0 && value <= 255 ? value : 1;
}
