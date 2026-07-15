import type { TimelineEvent, TimelinePin, TimelinePinTarget } from "./timelineContract";

/**
 * Pin targets are derived only from a server-provided Timeline subject.  In
 * particular, an inventory locator, incident, or missing resource never gets
 * promoted into a resource pin by the browser.
 */
export function timelinePinTargetForEvent(event: TimelineEvent): TimelinePinTarget | null {
  if (event.subject.kind === "resource") {
    return {
      kind: "resource",
      scope: event.scope,
      resource: event.subject.resource,
    };
  }
  if (event.subject.kind === "application_workflow") {
    return { kind: "application", applicationId: event.subject.applicationId };
  }
  return null;
}

/** Stable client identity for matching server-returned pin membership only. */
export function timelinePinTargetKey(target: TimelinePinTarget): string {
  if (target.kind === "application") return `application:${target.applicationId}`;
  const { scope, resource } = target;
  return JSON.stringify({
    kind: target.kind,
    scope: {
      workspaceId: scope.workspaceId,
      clusterId: scope.clusterId,
      namespaces: [...(scope.namespaces ?? [])].sort(),
    },
    resource: {
      apiGroup: resource.apiGroup ?? "",
      version: resource.version ?? "",
      kind: resource.kind,
      namespace: resource.namespace,
      name: resource.name,
      uid: resource.uid,
    },
  });
}

export function timelinePinTargetKeyForPin(pin: TimelinePin): string {
  return timelinePinTargetKey(pin.subject);
}

export function findTimelinePin(
  pins: readonly TimelinePin[],
  target: TimelinePinTarget,
): TimelinePin | null {
  const key = timelinePinTargetKey(target);
  return pins.find((pin) => timelinePinTargetKeyForPin(pin) === key) ?? null;
}

export function timelinePinLabel(pin: TimelinePin): string {
  if (pin.subject.kind === "application") return pin.subject.snapshot.name;
  const { resource } = pin.subject;
  const namespace = resource.namespace === null ? "" : `${resource.namespace}/`;
  return `${resource.kind} ${namespace}${resource.name}`;
}
