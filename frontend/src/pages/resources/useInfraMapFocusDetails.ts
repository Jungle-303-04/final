import { useEffect, useMemo, useState } from "react";

import type {
  ResourceDetail,
  ResourceIdentity,
  ResourceSummary,
  ResourcesPort,
} from "../../features/resources/resourcesContract";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import {
  RESOURCES_IDLE,
  RESOURCES_LOADING,
  resourcesFailure,
  resourcesSuccess,
  startResourcesResource,
  toResourcesFailure,
  type ResourcesResourceState,
} from "./resourcesPageStateModel";

export interface InfraMapFocusItem {
  identity: ResourceIdentity;
  key: string;
  label: string;
  resourceId: string;
}

interface ScopedState<T> {
  scope: string | null;
  state: ResourcesResourceState<T>;
}

interface UseInfraMapFocusDetailsInput {
  clusterId: string | null;
  items: readonly InfraMapFocusItem[];
  port: ResourcesPort;
  reportUnauthorized: () => void;
  revision: number;
}

export function infraMapFocusItemFromResource(
  resource: ResourceSummary,
): InfraMapFocusItem {
  const identity = identityFromResource(resource);
  return {
    identity,
    key: infraMapFocusKey(identity),
    label: `${identity.kind} · ${identity.name}`,
    resourceId: resource.inventoryKey,
  };
}

export function useInfraMapFocusDetails({
  clusterId,
  items,
  port,
  reportUnauthorized,
  revision,
}: UseInfraMapFocusDetailsInput): ResourcesResourceState<readonly ResourceDetail[]> {
  const scope = useMemo(() => {
    if (clusterId === null || items.length === 0) return null;
    return [
      clusterId,
      revision,
      ...items.map((item) => item.key).sort(),
    ].join(":");
  }, [clusterId, items, revision]);
  const [record, setRecord] = useState<ScopedState<readonly ResourceDetail[]>>({
    scope: null,
    state: RESOURCES_IDLE,
  });

  useEffect(() => {
    if (scope === null || clusterId === null || items.length === 0) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setRecord((current) => ({
        scope,
        state: current.scope === scope
          ? startResourcesResource(current.state)
          : RESOURCES_LOADING,
      }));
    });

    const requests = items.map((item) => acquireSharedRequest(
      port,
      `resources:infra-map-focus:${clusterId}:${item.key}:r${revision}`,
      (signal) => port.loadResourceDetail(clusterId, item.identity, signal),
    ));
    void Promise.all(requests.map((request) => request.promise)).then(
      (details) => {
        if (!active) return;
        setRecord({ scope, state: resourcesSuccess(details) });
      },
      (error: unknown) => {
        if (!active || isAbort(error)) return;
        const failure = toResourcesFailure(error);
        if (failure.code === "unauthorized") {
          reportUnauthorized();
          return;
        }
        setRecord((current) => current.scope === scope
          ? { ...current, state: resourcesFailure(current.state, failure) }
          : current);
      },
    );
    return () => {
      active = false;
      for (const request of requests) request.release();
    };
  }, [clusterId, items, port, reportUnauthorized, revision, scope]);

  if (record.scope === scope) return record.state;
  return scope === null ? RESOURCES_IDLE : RESOURCES_LOADING;
}

export function selectedPodIdsFromFocusDetails(
  details: readonly ResourceDetail[],
  focusItems: readonly InfraMapFocusItem[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const item of focusItems) {
    if (item.identity.resourceType === "pod") ids.add(item.resourceId);
  }
  for (const detail of details) {
    addPodId(ids, detail.resource);
    for (const group of detail.related) {
      for (const item of group.items) addPodId(ids, item);
    }
  }
  return ids;
}

export function infraMapFocusKey(identity: ResourceIdentity): string {
  return [
    identity.resourceType,
    identity.kind,
    identity.namespace ?? "",
    identity.name,
  ].join(":");
}

function identityFromResource(resource: ResourceSummary): ResourceIdentity {
  return {
    resourceType: resource.resourceType,
    kind: resource.kind,
    namespace: resource.namespace,
    name: resource.name,
  };
}

function addPodId(ids: Set<string>, resource: ResourceSummary): void {
  if (resource.resourceType === "pod") ids.add(resource.inventoryKey);
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
