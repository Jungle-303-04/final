import { SquareTerminal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import {
  EMPTY_POD_TERMINAL_PORT,
  type PodTerminalConnection,
  type PodTerminalPort,
} from "../../features/pod-terminal/podTerminalContract";
import type { ResourceCapabilities } from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import { Label } from "../../shared/ui/primitives/label";
import type { ResourceCapabilitiesFrame } from "./useResourceCapabilitiesDataFrame";

type TerminalStatus = "idle" | "connecting" | "connected" | "ended" | "failed";

export function PodTerminalDialog({
  capabilities,
  detail,
  port = EMPTY_POD_TERMINAL_PORT,
}: {
  capabilities: ResourceCapabilitiesFrame;
  detail: ResourceDetail;
  port?: PodTerminalPort;
}) {
  const { t } = useI18n();
  const session = useOptionalProductSession();
  const containers = detail.resource.facts.type === "pod"
    ? detail.resource.facts.containerNames ?? []
    : [];
  const authorized = capabilities.phase === "ready"
    && exactCapabilitySubject(capabilities.data, detail)
    && capabilities.data.capabilities.some((capability) => (
      capability.execution === "terminal"
      && capability.method === "WEBSOCKET"
      && capability.realtime
    ));
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState(containers[0] ?? "");
  const [command, setCommand] = useState("");
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [failure, setFailure] = useState("");
  const connectionRef = useRef<PodTerminalConnection | null>(null);
  const target = useMemo(() => {
    const namespace = detail.identity.namespace;
    if (!session || !namespace || !container) return null;
    return {
      workspaceId: session.workspaceId,
      clusterId: detail.clusterId,
      namespace,
      pod: detail.identity.name,
      container,
    };
  }, [container, detail, session]);

  useEffect(() => () => connectionRef.current?.close(), []);

  if (!authorized || !session || containers.length === 0 || detail.identity.namespace === null) {
    return null;
  }

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!target || !command.trim() || status === "connecting" || status === "connected") return;
    connectionRef.current?.close();
    setOutput("");
    setExitCode(null);
    setFailure("");
    setStatus("connecting");
    try {
      connectionRef.current = port.open(target, command, {
        onEvent(next) {
          if (next.type === "connected") {
            setStatus("connected");
          } else if (next.type === "output") {
            setOutput((current) => `${current}${next.data}`);
          } else if (next.type === "ended") {
            setExitCode(next.exitCode);
            setStatus("ended");
            connectionRef.current = null;
          } else {
            setFailure(next.message);
            setStatus("failed");
            connectionRef.current = null;
          }
        },
        onFailure() {
          setFailure(t("resources.detail.terminal.transportFailed"));
          setStatus("failed");
          connectionRef.current = null;
        },
      });
    } catch {
      setFailure(t("resources.detail.terminal.transportFailed"));
      setStatus("failed");
    }
  };

  const sendInput = (event: FormEvent) => {
    event.preventDefault();
    if (!stdin || status !== "connected") return;
    try {
      connectionRef.current?.sendInput(`${stdin}\n`);
      setStdin("");
    } catch {
      setFailure(t("resources.detail.terminal.inputFailed"));
      setStatus("failed");
    }
  };

  const stop = () => {
    connectionRef.current?.close();
    connectionRef.current = null;
    setStatus("ended");
    setExitCode(null);
  };

  return (
    <>
      <Button
        onClick={() => {
          if (!connectionRef.current) {
            setStatus("idle");
            setExitCode(null);
            setFailure("");
          }
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <SquareTerminal aria-hidden="true" />
        {t("resources.detail.terminal.open")}
      </Button>
      <Dialog
        onOpenChange={(next) => {
          if (!next) stop();
          setOpen(next);
        }}
        open={open}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("resources.detail.terminal.title", { name: detail.identity.name })}</DialogTitle>
            <DialogDescription>
              {t("resources.detail.terminal.description")}
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={start}>
            <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <div className="grid gap-1.5">
                <Label htmlFor="pod-terminal-container">{t("resources.detail.terminal.container")}</Label>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  disabled={status === "connecting" || status === "connected"}
                  id="pod-terminal-container"
                  onChange={(event) => setContainer(event.currentTarget.value)}
                  value={container}
                >
                  {containers.map((name) => <option key={name}>{name}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pod-terminal-command">{t("resources.detail.terminal.command")}</Label>
                <Input
                  autoComplete="off"
                  disabled={status === "connecting" || status === "connected"}
                  id="pod-terminal-command"
                  maxLength={1_024}
                  onChange={(event) => setCommand(event.currentTarget.value)}
                  placeholder={t("resources.detail.terminal.commandPlaceholder")}
                  required
                  value={command}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button disabled={!command.trim() || status === "connecting" || status === "connected"} type="submit">
                {status === "connecting"
                  ? t("resources.detail.terminal.connecting")
                  : t("resources.detail.terminal.run")}
              </Button>
              {status === "connected" ? (
                <Button onClick={stop} type="button" variant="destructive">
                  {t("resources.detail.terminal.stop")}
                </Button>
              ) : null}
              <span className="text-xs text-muted-foreground" role="status">
                {terminalStatus(status, exitCode, t)}
              </span>
            </div>
          </form>
          <pre
            aria-label={t("resources.detail.terminal.output")}
            className="min-h-56 max-h-[45vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100"
          >
            {output || t("resources.detail.terminal.outputEmpty")}
          </pre>
          {status === "connected" ? (
            <form className="flex gap-2" onSubmit={sendInput}>
              <Input
                aria-label={t("resources.detail.terminal.input")}
                autoComplete="off"
                maxLength={4_095}
                onChange={(event) => setStdin(event.currentTarget.value)}
                value={stdin}
              />
              <Button disabled={!stdin} type="submit" variant="secondary">
                {t("resources.detail.terminal.send")}
              </Button>
            </form>
          ) : null}
          {failure ? (
            <Alert variant="destructive"><AlertDescription>{failure}</AlertDescription></Alert>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              {t("common.action.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function exactCapabilitySubject(capabilities: ResourceCapabilities, detail: ResourceDetail): boolean {
  const subject = capabilities.subject;
  return subject.resourceId === detail.resource.inventoryKey
    && subject.clusterId === detail.clusterId
    && subject.kind === detail.identity.kind
    && subject.namespace === detail.identity.namespace
    && subject.name === detail.identity.name;
}

function terminalStatus(
  status: TerminalStatus,
  exitCode: number | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (status === "connecting") return t("resources.detail.terminal.connecting");
  if (status === "connected") return t("resources.detail.terminal.connected");
  if (status === "failed") return t("resources.detail.terminal.failed");
  if (status === "ended") {
    return exitCode === null
      ? t("resources.detail.terminal.closed")
      : t("resources.detail.terminal.exitCode", { code: exitCode });
  }
  return t("resources.detail.terminal.idle");
}
