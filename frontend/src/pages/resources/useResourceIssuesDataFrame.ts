import { useEffect, useRef, useState } from "react";

import type {
  ResourceIssueList,
  ResourceIssuesPort,
} from "../../features/issues/resourceIssuesContract";
import type { ResourceIdentity } from "../../features/resources/resourcesContract";
import {
  ResourcesPortFailure,
  type ResourcesPortFailure as ResourcesPortFailureType,
} from "../../features/resources/resourcesContract";

export type ResourceIssuesFrame =
  | { phase: "idle"; data: null; failure: null }
  | { phase: "loading"; data: null; failure: null }
  | { phase: "ready"; data: ResourceIssueList; failure: null }
  | { phase: "failed"; data: null; failure: ResourcesPortFailureType };

export function useResourceIssuesDataFrame(input: {
  active: boolean;
  authorityKey: string;
  clusterId: string | null;
  identity: ResourceIdentity | null;
  port: ResourceIssuesPort;
  reportUnauthorized: () => void;
  revision: number;
}): ResourceIssuesFrame {
  const { active, authorityKey, clusterId, identity, port, reportUnauthorized, revision } = input;
  const requestSequence = useRef(0);
  const resourceType = identity?.resourceType ?? null;
  const resourceKind = identity?.kind ?? null;
  const resourceNamespace = identity?.namespace ?? null;
  const resourceName = identity?.name ?? null;
  const identityKey = identity === null
    ? null
    : [resourceKind, resourceNamespace ?? "", resourceName].join("\u0000");
  const scope = active && clusterId && identityKey
    ? `${authorityKey}:${clusterId}:${identityKey}:r${revision}`
    : null;
  const [record, setRecord] = useState<{
    scope: string | null;
    frame: ResourceIssuesFrame;
  }>({ scope: null, frame: { phase: "idle", data: null, failure: null } });

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (
      scope === null
      || clusterId === null
      || resourceType === null
      || resourceKind === null
      || resourceName === null
    ) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      setRecord({ scope, frame: { phase: "loading", data: null, failure: null } });
    });
    void port.loadResourceIssues(clusterId, {
      resourceType,
      kind: resourceKind,
      namespace: resourceNamespace,
      name: resourceName,
    }, controller.signal).then((data) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      setRecord({ scope, frame: { phase: "ready", data, failure: null } });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      const failure = error instanceof ResourcesPortFailure
        ? error
        : new ResourcesPortFailure("error");
      if (failure.code === "unauthorized") reportUnauthorized();
      setRecord({ scope, frame: { phase: "failed", data: null, failure } });
    });
    return () => controller.abort();
  }, [
    clusterId,
    port,
    reportUnauthorized,
    resourceKind,
    resourceName,
    resourceNamespace,
    resourceType,
    scope,
  ]);

  if (scope === null) return { phase: "idle", data: null, failure: null };
  return record.scope === scope
    ? record.frame
    : { phase: "loading", data: null, failure: null };
}
