import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { CircleAlert, CircleCheck, LoaderCircle, RotateCcw, TerminalSquare } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  desktopBridge,
  type DesktopLocalTerminalEvent,
} from "./desktopBridge";
import { usePrefersReducedMotion } from "../motion/usePrefersReducedMotion";
import { useI18n } from "../shared/i18n";
import { cn } from "../shared/lib/cn";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../shared/ui/primitives/sheet";

type TerminalPhase = "connecting" | "connected" | "ended" | "failed";

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
    <Sheet onOpenChange={setOpen} open={open}>
      <Button
        aria-label={t("desktop.localTerminal.open")}
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
        closeLabel={t("desktop.localTerminal.close")}
        showCloseButton={false}
        side="bottom"
      >
        <SheetHeader className="shrink-0 border-b pr-14">
          <SheetTitle>{t("desktop.localTerminal.title")}</SheetTitle>
          <SheetDescription id="desktop-local-terminal-description">
            {t("desktop.localTerminal.description")}
          </SheetDescription>
        </SheetHeader>
        <DesktopLocalTerminalSurface key={open ? "open" : "closed"} />
      </SheetContent>
    </Sheet>
  );
}

function DesktopLocalTerminalSurface() {
  const { t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState<TerminalPhase>("connecting");
  const [shell, setShell] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useLayoutEffect(() => {
    const container = host.current;
    if (!container) return undefined;

    let disposed = false;
    let sessionId: string | null = null;
    const pendingEvents: DesktopLocalTerminalEvent[] = [];
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

    const dimensions = () => {
      fit.fit();
      return {
        columns: terminal.cols || DEFAULT_TERMINAL_COLUMNS,
        rows: terminal.rows || DEFAULT_TERMINAL_ROWS,
      };
    };
    const writeEvent = (event: DesktopLocalTerminalEvent) => {
      if (event.kind === "output") {
        terminal.write(event.data);
        return;
      }
      if (event.kind === "exit") {
        setPhase("ended");
        terminal.write(`\r\n[${t("desktop.localTerminal.ended")}]\r\n`);
        return;
      }
      setFailure(event.message);
      setPhase("failed");
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
      void desktopBridge.sendLocalTerminalInput({ sessionId, data }).catch((error: unknown) => {
        if (!disposed) {
          setFailure(error instanceof Error ? error.message : String(error));
          setPhase("failed");
        }
      });
    });
    let resizeFrame: number | null = null;
    const resize = () => {
      resizeFrame = null;
      if (disposed) return;
      const next = dimensions();
      if (sessionId) {
        void desktopBridge.resizeLocalTerminal({ sessionId, ...next }).catch((error: unknown) => {
          if (!disposed) {
            setFailure(error instanceof Error ? error.message : String(error));
            setPhase("failed");
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
        setShell(started.shell);
        setPhase("connected");
        terminal.focus();
        for (const event of pendingEvents.splice(0)) {
          if (event.sessionId === sessionId) writeEvent(event);
        }
        resize();
      } catch (error) {
        if (!disposed) {
          setFailure(error instanceof Error ? error.message : String(error));
          setPhase("failed");
        }
      }
    };
    void start();

    return () => {
      disposed = true;
      observer.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      inputDisposable.dispose();
      unlisten();
      terminal.dispose();
      if (sessionId) void desktopBridge.closeLocalTerminal(sessionId).catch(() => undefined);
    };
  }, [generation, reducedMotion, t]);

  const isFailed = phase === "failed";
  return (
    <section aria-label={t("desktop.localTerminal.title")} className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 sm:flex-nowrap">
        <TerminalPhaseBadge phase={phase} />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {shell ? t("desktop.localTerminal.shell", { shell }) : t("desktop.localTerminal.connecting")}
        </span>
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
      {failure ? (
        <p className="shrink-0 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {failure}
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
    <Badge className={cn("shrink-0 gap-1", phase === "connecting" && "text-muted-foreground")} variant={presentation.variant}>
      {presentation.icon}
      {presentation.label}
    </Badge>
  );
}
