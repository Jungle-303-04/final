import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  ResourceCatalog,
  ResourceDetail,
  ResourceIdentity,
  ResourceList,
  ResourcesPort,
  ResourcesPortFailure,
} from "../../features/resources/resourcesContract";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import {
  RESOURCES_IDLE,
  RESOURCES_LOADING,
  resourcesFailure,
  resourcesSuccess,
  startResourcesResource,
  toResourcesFailure,
  type ResourcesRequestTarget,
  type ResourcesResourceState,
} from "./resourcesPageStateModel";

const RESOURCE_LIST_LIMIT = 200;
const RESOURCE_CATALOG_CACHE_MS = 15_000;
const RESOURCE_LIST_CACHE_MS = 10_000;
const RESOURCE_DETAIL_CACHE_MS = 15_000;

interface ScopedState<T> {
  scope: string | null;
  state: ResourcesResourceState<T>;
}

interface ResourcesDataFrameInput {
  catalogNamespaces: readonly string[];
  catalogQuerySupported: boolean;
  detailClusterId: string | null;
  detailIdentity: ResourceIdentity | null;
  includeDeleted: boolean;
  listQuerySupported: boolean;
  namespace: string | null;
  onRequestFailure: (target: ResourcesRequestTarget, failure: ResourcesPortFailure) => void;
  onRequestSuccess: (target: ResourcesRequestTarget) => void;
  port: ResourcesPort;
  reportUnauthorized: () => void;
  catalogRevision: number;
  listRevision: number;
  selectedClusterExists: boolean;
  selectedClusterId: string | null;
  selectedResourceType: string | null;
}

export function useResourcesDataFrame(input: ResourcesDataFrameInput) {
  const {
    catalogNamespaces,
    catalogQuerySupported,
    detailClusterId,
    detailIdentity,
    includeDeleted,
    listQuerySupported,
    namespace,
    onRequestFailure,
    onRequestSuccess,
    port,
    reportUnauthorized,
    catalogRevision,
    listRevision,
    selectedClusterExists,
    selectedClusterId,
    selectedResourceType,
  } = input;
  const [catalogRecord, setCatalogRecord] = useState<ScopedState<ResourceCatalog>>({
    scope: null,
    state: RESOURCES_IDLE,
  });
  const [listRecord, setListRecord] = useState<ScopedState<ResourceList>>({
    scope: null,
    state: RESOURCES_IDLE,
  });
  const [detailRecord, setDetailRecord] = useState<ScopedState<ResourceDetail>>({
    scope: null,
    state: RESOURCES_IDLE,
  });
  const [denied, setDenied] = useState<DeniedState | null>(null);
  const [updatedAt, setUpdatedAt] = useState(0);
  const deniedRef = useRef<DeniedState | null>(null);

  const denyTarget = useCallback((
    clusterId: string,
    target: ResourcesRequestTarget,
  ) => {
    const current = deniedRef.current;
    const targets = current?.clusterId === clusterId ? current.targets : [];
    const next = { clusterId, targets: [...new Set([...targets, target])] };
    deniedRef.current = next;
    setDenied(next);
  }, []);
  const recoverDeniedTarget = useCallback((
    clusterId: string,
    target: ResourcesRequestTarget,
  ) => {
    const current = deniedRef.current;
    if (current?.clusterId !== clusterId || !current.targets.includes(target)) return;
    const targets = current.targets.filter((candidate) => candidate !== target);
    const next = targets.length === 0 ? null : { clusterId, targets };
    deniedRef.current = next;
    setDenied(next);
  }, []);

  const handleFailure = useCallback((
    error: unknown,
    clusterId: string,
    scope: string,
    target: "catalog" | "list" | "detail",
  ) => {
    const failure = toResourcesFailure(error);
    if (failure.code === "unauthorized") {
      reportUnauthorized();
      return;
    }
    onRequestFailure(target, failure);
    if (failure.code === "forbidden" && target !== "detail") {
      denyTarget(clusterId, target);
    }
    const fail = <T,>(current: ScopedState<T>): ScopedState<T> => current.scope === scope
      ? { ...current, state: resourcesFailure(current.state, failure) }
      : current;
    if (target === "catalog") setCatalogRecord(fail);
    if (target === "list") setListRecord(fail);
    if (target === "detail") setDetailRecord(fail);
  }, [denyTarget, onRequestFailure, reportUnauthorized]);

  const catalogNamespaceKey = catalogNamespaces.join(",");
  const catalogScope = catalogQuerySupported && selectedClusterExists && selectedClusterId
    ? `${selectedClusterId}:${catalogNamespaceKey}`
    : null;
  const catalog = scopedValue(catalogRecord, catalogScope);
  useEffect(() => {
    if (!catalogScope || !selectedClusterId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active || deniedRef.current?.clusterId === selectedClusterId) return;
      deniedRef.current = null;
      setDenied(null);
    });
    queueStart(
      setCatalogRecord,
      catalogScope,
      () => active,
      deniedRef.current?.clusterId === selectedClusterId,
    );
    const request = acquireSharedRequest(
      port,
      `resources:catalog:${catalogScope}:r${catalogRevision}`,
      (signal) => port.loadCatalog(
        selectedClusterId,
        catalogNamespaceKey === "" ? [] : catalogNamespaceKey.split(","),
        signal,
      ),
      { retainForMs: RESOURCE_CATALOG_CACHE_MS },
    );
    void request.promise.then(
      (data) => {
        if (!active) return;
        setCatalogRecord({ scope: catalogScope, state: resourcesSuccess(data) });
        setUpdatedAt(Date.now());
        onRequestSuccess("catalog");
        recoverDeniedTarget(selectedClusterId, "catalog");
      },
      (error: unknown) => {
        if (active && !isAbort(error)) handleFailure(error, selectedClusterId, catalogScope, "catalog");
      },
    );
    return () => { active = false; request.release(); };
  }, [
    catalogNamespaceKey, catalogQuerySupported, catalogScope, handleFailure, onRequestSuccess, port,
    recoverDeniedTarget, catalogRevision, selectedClusterId,
  ]);

  const selectedTypeExists = catalog.phase === "ready" && selectedResourceType !== null &&
    catalog.data.items.some((item) => item.resourceType === selectedResourceType);
  const listScope = listQuerySupported && selectedTypeExists && selectedClusterId && selectedResourceType
    ? [selectedClusterId, selectedResourceType, namespace ?? "", includeDeleted ? "deleted" : "active"].join(":")
    : null;
  const list = scopedValue(listRecord, listScope);
  useEffect(() => {
    if (!listScope || !selectedClusterId || !selectedResourceType) return;
    let active = true;
    queueStart(
      setListRecord,
      listScope,
      () => active,
      deniedRef.current?.clusterId === selectedClusterId,
    );
    const request = acquireSharedRequest(
      port,
      `resources:list:${listScope}:r${listRevision}`,
      (signal) => port.listResources(selectedClusterId, {
        includeDeleted,
        limit: RESOURCE_LIST_LIMIT,
        namespace,
        resourceType: selectedResourceType,
      }, signal),
      { retainForMs: RESOURCE_LIST_CACHE_MS },
    );
    void request.promise.then(
      (data) => {
        if (!active) return;
        setListRecord({ scope: listScope, state: resourcesSuccess(data) });
        setUpdatedAt(Date.now());
        onRequestSuccess("list");
        recoverDeniedTarget(selectedClusterId, "list");
      },
      (error: unknown) => {
        if (active && !isAbort(error)) handleFailure(error, selectedClusterId, listScope, "list");
      },
    );
    return () => { active = false; request.release(); };
  }, [
    handleFailure, includeDeleted, listScope, namespace, onRequestSuccess, port,
    recoverDeniedTarget, listRevision, selectedClusterId, selectedResourceType,
  ]);

  const detailScope = detailIdentity && detailClusterId
    ? `${detailClusterId}:${detailIdentity.resourceType}:${detailIdentity.kind}:${detailIdentity.namespace ?? ""}:${detailIdentity.name}`
    : null;
  const detail = scopedValue(detailRecord, detailScope);
  useEffect(() => {
    if (!detailScope || !detailIdentity || !detailClusterId) return;
    let active = true;
    queueStart(
      setDetailRecord,
      detailScope,
      () => active,
      deniedRef.current?.clusterId === detailClusterId,
    );
    const request = acquireSharedRequest(
      port,
      `resources:detail:${detailScope}:r${listRevision}`,
      (signal) => port.loadResourceDetail(detailClusterId, detailIdentity, signal),
      { retainForMs: RESOURCE_DETAIL_CACHE_MS },
    );
    void request.promise.then(
      (data) => {
        if (!active) return;
        setDetailRecord({ scope: detailScope, state: resourcesSuccess(data) });
        setUpdatedAt(Date.now());
        onRequestSuccess("detail");
        recoverDeniedTarget(detailClusterId, "detail");
      },
      (error: unknown) => {
        if (active && !isAbort(error)) handleFailure(error, detailClusterId, detailScope, "detail");
      },
    );
    return () => { active = false; request.release(); };
  }, [
    detailClusterId, detailIdentity, detailScope, handleFailure, onRequestSuccess, port,
    recoverDeniedTarget, listRevision,
  ]);

  return {
    catalog,
    detail,
    list,
    selectedTypeExists,
    denied: denied?.clusterId === selectedClusterId,
    updatedAt,
  };
}

function scopedValue<T>(
  record: ScopedState<T>,
  scope: string | null,
): ResourcesResourceState<T> {
  if (record.scope === scope) return record.state;
  return scope ? RESOURCES_LOADING : RESOURCES_IDLE;
}

function queueStart<T>(
  setRecord: Dispatch<SetStateAction<ScopedState<T>>>,
  scope: string,
  active: () => boolean,
  discardCurrent: boolean,
) {
  queueMicrotask(() => {
    if (!active()) return;
    setRecord((current) => ({
      scope,
      state: !discardCurrent && current.scope === scope
        ? startResourcesResource(current.state)
        : RESOURCES_LOADING,
    }));
  });
}

interface DeniedState {
  clusterId: string;
  targets: ResourcesRequestTarget[];
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
