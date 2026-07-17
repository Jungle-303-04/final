import { PlugZap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  ServiceAccessCapabilities,
  ServiceAccessPort,
  ServiceAccessPortDescriptor,
} from "../../features/service-access/serviceAccessContract";
import type {
  PortForwardSessionPort,
  PortForwardStartReceipt,
} from "../../features/service-access/portForwardSessionContract";
import { useOptionalPortForwardSessionsController } from "../../features/service-access/PortForwardSessionsProvider";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import { PortForwardSessionsPanel } from "./PortForwardSessionsPanel";

type ForwardFailure = "none" | "start" | "stale";

export function PortForwardAction({
  capabilities,
  inventoryKey,
  port,
  sessions,
}: {
  capabilities: ServiceAccessCapabilities;
  inventoryKey: string;
  port: ServiceAccessPort;
  sessions?: PortForwardSessionPort;
}) {
  const { t } = useI18n();
  const sessionState = useOptionalPortForwardSessionsController();
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(() => descriptorKey(capabilities.ports[0]));
  const [localPort, setLocalPort] = useState(() => String(capabilities.ports[0]?.port ?? ""));
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ForwardFailure>("none");
  const [receipt, setReceipt] = useState<PortForwardStartReceipt | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, []);

  const selected = capabilities.ports.find((item) => descriptorKey(item) === selectedKey)
    ?? capabilities.ports[0]
    ?? null;
  const localPortNumber = parsePort(localPort);
  const available = capabilities.localPortForward === "desktop-required"
    && selected !== null
    && sessions?.available === true;

  // A browser must never offer a manual target-cluster escape hatch. Until the
  // typed agent tunnel and the desktop loopback transport are both present,
  // the capability is absent rather than rendering a dead action.
  if (!available) return null;

  const start = async () => {
    if (!available || !selected || !sessions?.available || localPortNumber === null || pending) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setFailure("none");
    try {
      const current = await port.resolve(inventoryKey, controller.signal);
      const exactPort = current.ports.find((item) => descriptorKey(item) === selectedKey) ?? null;
      if (
        !sameResource(capabilities, current)
        || current.localPortForward !== "desktop-required"
        || exactPort === null
      ) {
        setFailure("stale");
        return;
      }
      const next = await sessions.start({
        scope: {
          workspaceId: current.scope.workspaceId,
          clusterId: current.scope.clusterId,
          namespaces: [...current.scope.namespaces],
          freshness: current.scope.freshness,
        },
        resource: {
          apiGroup: current.resource.apiGroup === "core" ? "core" : "",
          version: "v1",
          kind: current.resource.kind,
          namespace: current.resource.namespace,
          name: current.resource.name,
          uid: current.resource.uid,
        },
        remotePort: exactPort.port,
        localPort: localPortNumber,
        listenAddress: "127.0.0.1",
        confirmation: true,
      }, controller.signal);
      if (request.current !== controller) return;
      setReceipt(next);
      sessionState?.refreshAfterMutation();
      setOpen(false);
    } catch {
      if (!controller.signal.aborted) setFailure("start");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  };

  return (
    <>
      <Button
        aria-describedby={!available ? "port-forward-unavailable" : undefined}
        disabled={!available}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <PlugZap aria-hidden="true" />
        {t("resources.serviceAccess.forward.action")}
      </Button>
      {receipt ? (
        <Alert className="w-full max-w-[32rem]">
          <AlertDescription>
            {t("resources.serviceAccess.forward.started", { port: receipt.localPort })}
          </AlertDescription>
        </Alert>
      ) : null}
      {sessions ? <PortForwardSessionsPanel /> : null}
      <Dialog onOpenChange={(next) => !pending && setOpen(next)} open={open}>
        <DialogContent className="sm:max-w-[32rem]" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>{t("resources.serviceAccess.forward.title")}</DialogTitle>
            <DialogDescription>
              {t("resources.serviceAccess.forward.nativeBoundary")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {capabilities.portDiscovery === "partial" ? (
              <Alert>
                <AlertDescription>{t("resources.serviceAccess.forward.partial")}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-2">
              <Label>{t("resources.serviceAccess.forward.remotePort")}</Label>
              <Select
                onValueChange={(value) => {
                  if (value === null) return;
                  const next = capabilities.ports.find((item) => descriptorKey(item) === value);
                  if (!next) return;
                  setSelectedKey(value);
                  setLocalPort(String(next.port));
                }}
                value={selected ? descriptorKey(selected) : ""}
              >
                <SelectTrigger
                  aria-label={t("resources.serviceAccess.forward.remotePort")}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {capabilities.ports.map((item) => (
                    <SelectItem key={descriptorKey(item)} value={descriptorKey(item)}>
                      {portLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="service-access-local-port">
                {t("resources.serviceAccess.forward.localPort")}
              </Label>
              <Input
                aria-invalid={localPortNumber === null}
                id="service-access-local-port"
                inputMode="numeric"
                onChange={(event) => setLocalPort(event.currentTarget.value)}
                value={localPort}
              />
            </div>
            {failure !== "none" ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {failure === "stale"
                    ? t("resources.serviceAccess.forward.stale")
                    : t("resources.serviceAccess.forward.failed")}
                </AlertDescription>
              </Alert>
            ) : null}
            {localPortNumber === null ? (
              <Alert variant="destructive">
                <AlertDescription>{t("resources.serviceAccess.forward.invalidPort")}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">
                {t("common.action.cancel")}
              </Button>
              <Button disabled={pending || localPortNumber === null} onClick={() => void start()} type="button">
                {pending
                  ? t("resources.serviceAccess.forward.starting")
                  : t("resources.serviceAccess.forward.start")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function sameResource(
  previous: ServiceAccessCapabilities,
  current: ServiceAccessCapabilities,
): boolean {
  return previous.scope.workspaceId === current.scope.workspaceId
    && previous.scope.clusterId === current.scope.clusterId
    && previous.resource.apiGroup === current.resource.apiGroup
    && previous.resource.version === current.resource.version
    && previous.resource.kind === current.resource.kind
    && previous.resource.namespace === current.resource.namespace
    && previous.resource.name === current.resource.name
    && previous.resource.uid === current.resource.uid;
}

function descriptorKey(port: ServiceAccessPortDescriptor | undefined): string {
  if (!port) return "";
  return JSON.stringify([port.containerName, port.port, port.name, port.protocol]);
}

function portLabel(port: ServiceAccessPortDescriptor): string {
  const identity = [port.containerName, port.name].filter(Boolean).join(" · ");
  return `${identity ? `${identity} · ` : ""}${port.port}/${port.protocol}`;
}

function parsePort(value: string): number | null {
  if (!/^[0-9]{1,5}$/u.test(value)) return null;
  const port = Number(value);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535 ? port : null;
}
