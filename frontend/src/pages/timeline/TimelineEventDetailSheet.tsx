import type { KeyboardEvent, ReactNode } from "react";

import type { I18nController } from "../../shared/i18n";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../shared/ui/primitives/sheet";
import { Button } from "../../shared/ui/primitives/button";
import type { ResourceRef } from "../../shared/parity/referenceParity";
import {
  findTimelinePin,
  timelinePinTargetForEvent,
  timelinePinTargetKey,
} from "../../features/timeline/timelinePinTargets";
import type { TimelineEvent } from "../../features/timeline/timelineContract";
import type { TimelinePinsController } from "./useTimelinePins";

export function TimelineEventDetailSheet({
  event,
  formatDate,
  onClose,
  onNavigate,
  pins,
  t,
}: {
  event: TimelineEvent | null;
  formatDate: I18nController["formatDate"];
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
  pins: TimelinePinsController | null;
  t: I18nController["t"];
}) {
  const pinTarget = event === null ? null : timelinePinTargetForEvent(event);
  const existingPin = pins?.phase === "ready" && pins.pinSet !== null && pinTarget !== null
    ? findTimelinePin(pins.pinSet.pins, pinTarget)
    : null;
  const targetPending = pinTarget !== null && pins?.pendingTargetKey === timelinePinTargetKey(pinTarget);
  const removalPending = existingPin !== null && pins?.pendingPinId === existingPin.pinId;
  return (
    <Sheet onOpenChange={(open) => { if (!open) onClose(); }} open={event !== null}>
      {event === null ? null : (
        <SheetContent
          aria-describedby={undefined}
          className="gap-0 overflow-hidden sm:max-w-lg"
          onKeyDown={(keyEvent) => handleArrowNavigation(keyEvent, onNavigate)}
        >
          <SheetHeader className="border-b pr-12">
            <SheetTitle className="min-w-0 break-words">{event.title}</SheetTitle>
            <SheetDescription>{t("timeline.details.title")}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 overflow-y-auto p-4">
            <div className="grid gap-5">
              <DetailSection heading={t("timeline.details.event")}>
                <DetailRows rows={[
                  [t("timeline.details.identifier"), event.id],
                  [t("timeline.details.source"), event.source],
                  [t("timeline.details.sourceKey"), event.sourceKey],
                  [t("timeline.details.nativeId"), event.nativeId],
                  [t("timeline.details.occurredAt"), formatDate(new Date(event.occurredAt), { dateStyle: "medium", timeStyle: "medium" })],
                  [t("timeline.details.activity"), event.activity],
                  [t("timeline.details.type"), event.type],
                  [t("timeline.details.severity"), event.severity],
                ]} />
              </DetailSection>
              <DetailSection heading={t("timeline.details.scope")}>
                <DetailRows rows={[
                  [t("timeline.details.workspace"), event.scope.workspaceId],
                  [t("timeline.details.cluster"), event.scope.clusterId],
                  [t("timeline.details.namespaces"), event.scope.namespaces?.join(", ") || t("timeline.details.allNamespaces")],
                ]} />
              </DetailSection>
              <DetailSection heading={t("timeline.details.subject")}>
                <DetailRows rows={subjectRows(event, t)} />
              </DetailSection>
              {pins?.phase === "ready" && pinTarget !== null ? (
                <DetailSection heading={t("timeline.pins.title")}>
                  <div>
                    <Button
                      disabled={pins.pendingPinId !== null || pins.pendingTargetKey !== null}
                      onClick={() => {
                        if (existingPin === null) void pins.add(pinTarget);
                        else void pins.remove(existingPin);
                      }}
                      type="button"
                      variant="outline"
                    >
                      {existingPin === null
                        ? targetPending ? t("timeline.pins.pendingAdd") : t("timeline.pins.add")
                        : removalPending ? t("timeline.pins.pendingRemove") : t("timeline.pins.remove")}
                    </Button>
                  </div>
                </DetailSection>
              ) : null}
              <DetailSection heading={t("timeline.details.resource")}>
                {event.resource === null
                  ? <p className="text-sm text-muted-foreground">{t("timeline.details.none")}</p>
                  : <DetailRows rows={resourceRows(event.resource, t)} />}
              </DetailSection>
              <DetailSection heading={t("timeline.details.owner")}>
                {event.owner === null
                  ? <p className="text-sm text-muted-foreground">{t("timeline.details.none")}</p>
                  : <DetailRows rows={resourceRows(event.owner, t)} />}
              </DetailSection>
              <DetailSection heading={t("timeline.details.metadata")}>
                <MetadataRows metadata={event.metadata} t={t} />
              </DetailSection>
            </div>
          </div>
          <SheetFooter className="border-t bg-muted/30 sm:flex-row sm:justify-between">
            <Button onClick={() => onNavigate(-1)} type="button" variant="outline">
              {t("timeline.action.previousEvent")}
            </Button>
            <Button onClick={() => onNavigate(1)} type="button" variant="outline">
              {t("timeline.action.nextEvent")}
            </Button>
          </SheetFooter>
        </SheetContent>
      )}
    </Sheet>
  );
}

function DetailSection({ children, heading }: { children: ReactNode; heading: string }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium">{heading}</h3>
      {children}
    </section>
  );
}

function DetailRows({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)]">
      {rows.map(([label, value]) => (
        <div className="contents" key={`${label}:${value}`}>
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MetadataRows({
  metadata,
  t,
}: {
  metadata: Readonly<Record<string, unknown>>;
  t: I18nController["t"];
}) {
  const entries = Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{t("timeline.details.noMetadata")}</p>;
  return <DetailRows rows={entries.map(([key, value]) => [key, safeMetadataValue(value)])} />;
}

function subjectRows(
  event: TimelineEvent,
  t: I18nController["t"],
): readonly (readonly [string, string])[] {
  const subject = event.subject;
  if (subject.kind === "resource") {
    return [[t("timeline.details.field.kind"), subject.kind], ...resourceRows(subject.resource, t)];
  }
  if (subject.kind === "inventory_locator") {
    return [
      [t("timeline.details.field.kind"), subject.kind],
      [t("timeline.details.field.inventoryKey"), subject.inventoryKey],
      [t("timeline.details.field.apiGroup"), subject.apiGroup],
      [t("timeline.details.field.version"), subject.version],
      [t("timeline.details.field.resourceKind"), subject.resourceKind],
      [t("timeline.details.field.namespace"), subject.namespace ?? ""],
      [t("timeline.details.field.name"), subject.name],
    ];
  }
  if (subject.kind === "application_workflow") {
    return [
      [t("timeline.details.field.kind"), subject.kind],
      [t("timeline.details.field.applicationId"), subject.applicationId],
      [t("timeline.details.field.bindingId"), subject.bindingId],
      [t("timeline.details.field.workflowRunId"), subject.workflowRunId],
    ];
  }
  return [
    [t("timeline.details.field.kind"), subject.kind],
    [t("timeline.details.field.incidentId"), subject.incidentId],
    [t("timeline.details.field.correlationId"), subject.correlationId ?? ""],
  ];
}

function resourceRows(
  resource: ResourceRef,
  t: I18nController["t"],
): readonly (readonly [string, string])[] {
  return [
    [t("timeline.details.field.apiGroup"), resource.apiGroup ?? ""],
    [t("timeline.details.field.version"), resource.version ?? ""],
    [t("timeline.details.field.kind"), resource.kind],
    [t("timeline.details.field.namespace"), resource.namespace ?? ""],
    [t("timeline.details.field.name"), resource.name],
    [t("timeline.details.field.uid"), resource.uid],
  ];
}

function safeMetadataValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, (_key, nested) => (
      typeof nested === "bigint" ? nested.toString() : nested
    ));
    return serialized ?? "";
  } catch {
    return String(value);
  }
}

function handleArrowNavigation(
  event: KeyboardEvent<HTMLElement>,
  onNavigate: (direction: -1 | 1) => void,
) {
  const direction = event.key === "ArrowRight" || event.key === "ArrowDown"
    ? 1
    : event.key === "ArrowLeft" || event.key === "ArrowUp"
      ? -1
      : null;
  if (direction === null) return;
  event.preventDefault();
  onNavigate(direction);
}
