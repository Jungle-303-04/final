import { Globe2, Square } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  toServiceRequestOperationResult,
} from "../../features/service-access/createServiceAccessAdapter";
import type {
  ServiceAccessCapabilities,
  ServiceAccessPort,
  ServiceRequestScheme,
} from "../../features/service-access/serviceAccessContract";
import type { PortForwardSessionPort } from "../../features/service-access/portForwardSessionContract";
import { OperationStatusFeedback } from "../../features/operations/OperationStatusFeedback";
import {
  useOperationStatus,
  useOptionalOperationStatusStore,
} from "../../features/operations/OperationStatusStore";
import type { ResourceActionReceipt } from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import { PortForwardAction } from "./PortForwardAction";

type CapabilityState =
  | { phase: "loading" }
  | { phase: "failed"; inventoryKey: string }
  | { phase: "ready"; inventoryKey: string; data: ServiceAccessCapabilities };

const SERVICE_BODY_PREVIEW_CHARACTERS = 32_768;

export function ServiceAccessActions({
  detail,
  port,
  portForwardSessions,
}: {
  detail: ResourceDetail;
  port: ServiceAccessPort;
  portForwardSessions?: PortForwardSessionPort;
}) {
  const { t } = useI18n();
  const operationStore = useOptionalOperationStatusStore();
  const [capabilities, setCapabilities] = useState<CapabilityState>({ phase: "loading" });
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [scheme, setScheme] = useState<ServiceRequestScheme>("http");
  const [path, setPath] = useState("/");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [receipt, setReceipt] = useState<ResourceActionReceipt | null>(null);
  const isAccessTarget = exactAccessTarget(detail);

  useEffect(() => {
    if (!isAccessTarget) return;
    const controller = new AbortController();
    void port.resolve(detail.resource.inventoryKey, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      if (!capabilityMatchesDetail(value, detail)) {
        setCapabilities({ phase: "failed", inventoryKey: detail.resource.inventoryKey });
        return;
      }
      setCapabilities({
        phase: "ready",
        inventoryKey: detail.resource.inventoryKey,
        data: value,
      });
      const first = value.ports[0] ?? null;
      setSelectedPort(first?.port ?? null);
      setScheme(first?.defaultScheme ?? "http");
    }).catch(() => {
      if (!controller.signal.aborted) {
        setCapabilities({ phase: "failed", inventoryKey: detail.resource.inventoryKey });
      }
    });
    return () => controller.abort();
  }, [detail, detail.resource.inventoryKey, isAccessTarget, port]);

  if (
    !isAccessTarget
    || capabilities.phase !== "ready"
    || capabilities.inventoryKey !== detail.resource.inventoryKey
  ) {
    return null;
  }
  const data = capabilities.data;
  const isService = data.resource.kind === "Service";
  const currentPort = data.ports.find(({ port: value }) => value === selectedPort)
    ?? data.ports[0]
    ?? null;
  const requestAvailable = isService
    && currentPort !== null
    && data.serviceRequest === "available";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!requestAvailable || !currentPort || pending) return;
    setPending(true);
    setFailed(false);
    try {
      const next = await port.start(data, {
        port: currentPort.port,
        scheme,
        path,
        reason: t("resources.serviceAccess.request.reason", { name: data.resource.name }),
      });
      setReceipt(next);
      operationStore?.start(next.commandId);
      setRequestOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {isService && currentPort ? (
        <Button
          disabled={!requestAvailable}
          onClick={() => {
            setFailed(false);
            setRequestOpen(true);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Globe2 aria-hidden="true" />
          {t("resources.serviceAccess.request.action")}
        </Button>
      ) : null}
      <PortForwardAction
        capabilities={data}
        inventoryKey={detail.resource.inventoryKey}
        key={data.revision}
        port={port}
        sessions={portForwardSessions}
      />
      {receipt ? (
        <div
          className="grid w-full max-w-[26rem] gap-2 rounded-lg border bg-card p-3"
          data-testid="service-access-session"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline">{t("resources.serviceAccess.session")}</Badge>
            <OverflowIdentity
              className="min-w-0 flex-1 text-xs text-muted-foreground"
              render={<span />}
              value={data.resource.name}
            />
          </div>
          {operationStore ? (
            <ServiceRequestSession
              commandId={receipt.commandId}
              correlationId={receipt.correlationId}
              onCancel={() => port.cancel(receipt.commandId)}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("resources.detail.action.accepted", { id: receipt.correlationId })}
            </p>
          )}
        </div>
      ) : null}
      {isService && currentPort ? (
        <Dialog onOpenChange={(open) => !pending && setRequestOpen(open)} open={requestOpen}>
          <DialogContent className="sm:max-w-[32rem]" showCloseButton={!pending}>
            <form className="grid gap-4" onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>{t("resources.serviceAccess.request.title")}</DialogTitle>
                <DialogDescription>
                  {t("resources.serviceAccess.request.description", { name: data.resource.name })}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label>{t("resources.serviceAccess.port")}</Label>
                <Select
                  onValueChange={(value) => {
                    const next = data.ports.find(({ port }) => port === Number(value));
                    if (!next) return;
                    setSelectedPort(next.port);
                    setScheme(next.defaultScheme);
                  }}
                  value={String(currentPort.port)}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectLabel>{t("resources.serviceAccess.port")}</SelectLabel>
                      {data.ports.map((item) => (
                        <SelectItem key={item.port} value={String(item.port)}>
                          {[item.name, `${item.port}/TCP`, item.appProtocol].filter(Boolean).join(" · ")}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
                <div className="grid gap-2">
                  <Label>{t("resources.serviceAccess.scheme")}</Label>
                  <Select
                    onValueChange={(value) => {
                      if (value === "http" || value === "https") setScheme(value);
                    }}
                    value={scheme}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectItem value="http">http</SelectItem>
                      <SelectItem value="https">https</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="service-access-path">{t("resources.serviceAccess.path")}</Label>
                  <Input
                    id="service-access-path"
                    onChange={(event) => setPath(normalizePathInput(event.currentTarget.value))}
                    required
                    value={path}
                  />
                </div>
              </div>
              {failed ? (
                <Alert variant="destructive">
                  <AlertDescription>{t("resources.serviceAccess.request.failed")}</AlertDescription>
                </Alert>
              ) : null}
              <DialogFooter>
                <Button disabled={pending} onClick={() => setRequestOpen(false)} type="button" variant="outline">
                  {t("common.action.cancel")}
                </Button>
                <Button disabled={pending} type="submit">
                  {t("resources.serviceAccess.request.run")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function ServiceRequestSession({
  commandId,
  correlationId,
  onCancel,
}: {
  commandId: string;
  correlationId: string;
  onCancel: () => Promise<void>;
}) {
  const { t } = useI18n();
  const snapshot = useOperationStatus(commandId);
  const [cancelling, setCancelling] = useState(false);
  const result = useMemo(() => {
    const payload = snapshot.event?.payload;
    const commandResult = isRecord(payload?.result) ? payload.result : null;
    return toServiceRequestOperationResult(commandResult?.service_request);
  }, [snapshot.event]);
  const active = ["connecting", "running", "reconnecting"].includes(snapshot.status);
  return (
    <>
      <OperationStatusFeedback commandId={commandId} correlationId={correlationId} />
      {active ? (
        <Button
          disabled={cancelling}
          onClick={() => {
            setCancelling(true);
            void onCancel().finally(() => setCancelling(false));
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Square aria-hidden="true" />
          {t("resources.serviceAccess.request.cancel")}
        </Button>
      ) : null}
      {result ? (
        <section className="grid min-w-0 gap-2" data-slot="service-request-result">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">{result.status} {result.statusText}</Badge>
            <span>{result.durationMs} ms</span>
            <span>{result.bodyBytes} B{result.truncated ? " · truncated" : ""}</span>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre rounded-lg bg-muted p-3 text-xs">
            {result.body.slice(0, SERVICE_BODY_PREVIEW_CHARACTERS) || "(empty body)"}
          </pre>
        </section>
      ) : null}
    </>
  );
}

function exactAccessTarget(detail: ResourceDetail): boolean {
  const type = detail.resource.resourceType.toLocaleLowerCase();
  return (type === "pod" || type === "service")
    && detail.resource.kind.toLocaleLowerCase() === type
    && detail.resource.apiVersion === "v1"
    && detail.resource.namespace !== null
    && detail.resource.uid !== null
    && detail.resource.deletedAt === null;
}

function capabilityMatchesDetail(
  capabilities: ServiceAccessCapabilities,
  detail: ResourceDetail,
): boolean {
  return capabilities.scope.clusterId === detail.clusterId
    && capabilities.resource.kind.toLocaleLowerCase() === detail.resource.resourceType
    && capabilities.resource.namespace === detail.resource.namespace
    && capabilities.resource.name === detail.resource.name
    && capabilities.resource.uid === detail.resource.uid;
}

function normalizePathInput(value: string): string {
  const clean = value.replace(/[\r\n\0#]/gu, "");
  return `/${clean.replace(/^\/+/u, "")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
