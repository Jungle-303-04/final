import { useEffect, useRef, useState } from "react";

import type {
  ResourceCapabilities,
  ResourceCapabilitiesPort,
} from "../../features/resources/resourceCapabilitiesContract";
import {
  ResourcesPortFailure,
  type ResourcesPortFailure as ResourcesPortFailureType,
} from "../../features/resources/resourcesContract";

export type ResourceCapabilitiesFrame =
  | { phase: "idle"; data: null; failure: null }
  | { phase: "loading"; data: null; failure: null }
  | { phase: "ready"; data: ResourceCapabilities; failure: null }
  | { phase: "failed"; data: null; failure: ResourcesPortFailureType };

export function useResourceCapabilitiesDataFrame(input: {
  active: boolean;
  authorityKey: string;
  port: ResourceCapabilitiesPort;
  reportUnauthorized: () => void;
  resourceId: string | null;
}): ResourceCapabilitiesFrame {
  const { active, authorityKey, port, reportUnauthorized, resourceId } = input;
  const requestSequence = useRef(0);
  const scope = active && resourceId ? `${authorityKey}:${resourceId}` : null;
  const [record, setRecord] = useState<{
    scope: string | null;
    frame: ResourceCapabilitiesFrame;
  }>({ scope: null, frame: { phase: "idle", data: null, failure: null } });

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (scope === null || resourceId === null) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      setRecord({ scope, frame: { phase: "loading", data: null, failure: null } });
    });
    void port.loadResourceCapabilities(resourceId, controller.signal).then((data) => {
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
  }, [port, reportUnauthorized, resourceId, scope]);

  if (scope === null) return { phase: "idle", data: null, failure: null };
  return record.scope === scope
    ? record.frame
    : { phase: "loading", data: null, failure: null };
}
