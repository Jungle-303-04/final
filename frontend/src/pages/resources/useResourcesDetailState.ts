import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ResourceIdentity } from "../../features/resources/resourcesContract";
import {
  withoutRetryBlock,
  type ResourcesRetryBlocks,
} from "./resourcesPageStateModel";
import {
  decodeResourceDetail,
  decodeResourceTarget,
  encodeResourceDetail,
  encodeResourceTarget,
} from "./resourcesUrlState";

export function useResourcesDetailState(
  selectedClusterId: string | null,
  selectedResourceType: string | null,
  setRetryBlocks: Dispatch<SetStateAction<ResourcesRetryBlocks>>,
) {
  const filter = useUnifiedFilter();
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const restoreRowKey = useRef<string | null>(null);
  const detailRequested =
    filter.detail.detail !== null ||
    filter.detail.resource !== null ||
    filter.detail.resourceKind !== null;
  const detailTarget = useMemo(
    () => {
      if (filter.detail.detail !== null) {
        const identity = decodeResourceDetail(
          selectedResourceType,
          filter.detail.detail,
        );
        return selectedClusterId !== null && identity !== null
          ? { clusterId: selectedClusterId, identity }
          : null;
      }
      return decodeResourceTarget(
        selectedClusterId,
        selectedResourceType,
        filter.detail.resourceKind,
        filter.detail.resource,
      );
    },
    [
      filter.detail.detail,
      filter.detail.resource,
      filter.detail.resourceKind,
      selectedClusterId,
      selectedResourceType,
    ],
  );

  useEffect(() => {
    if (
      detailTarget === null || filter.detail.detail !== null
    )
      return;
    filter.updateFilters(
      (current) => ({
        ...current,
        common: { ...current.common, clusters: [detailTarget.clusterId] },
        resources: {
          ...current.resources,
          types: [detailTarget.identity.resourceType],
        },
      }),
      "legacy-migration",
    );
    filter.updateDetail(
      (current) => ({
        ...current,
        detail: encodeResourceDetail(detailTarget.identity),
        resource: null,
        resourceKind: null,
      }),
      "detail-expand",
    );
  }, [detailTarget, filter]);

  useEffect(() => {
    if (detailRequested) return;
    const key = restoreRowKey.current;
    restoreRowKey.current = null;
    requestAnimationFrame(() => {
      if (key) rowButtons.current.get(key)?.focus();
    });
  }, [detailRequested]);

  const closeDetail = useCallback(() => {
    setRetryBlocks((current) => withoutRetryBlock(current, "detail"));
    filter.updateDetail(
      (current) => ({
        ...current,
        detail: null,
        full: false,
        resource: null,
        resourceKind: null,
        tab: null,
      }),
      "detail-close",
    );
  }, [filter, setRetryBlocks]);

  const openDetail = useCallback(
    (identity: ResourceIdentity, tab: string | null = null) => {
      if (selectedClusterId === null) return;
      restoreRowKey.current = identityKey(identity);
      filter.updateFilters(
        (current) => ({
          ...current,
          resources: { ...current.resources, types: [identity.resourceType] },
        }),
        "chip-add",
      );
      filter.updateDetail(
        (current) => ({
          ...current,
          detail: encodeResourceDetail(identity),
          full: false,
          resource: null,
          resourceKind: null,
          tab,
        }),
        "detail-open",
      );
    },
    [filter, selectedClusterId],
  );

  const navigateDetail = useCallback((identity: ResourceIdentity) => {
    restoreRowKey.current = identityKey(identity);
    if (identity.resourceType !== selectedResourceType) {
      filter.updateFilters(
        (current) => ({
          ...current,
          resources: {
            ...current.resources,
            types: [identity.resourceType],
          },
        }),
        "chip-add",
      );
    }
    filter.updateDetail(
      (current) => ({
        ...current,
        detail: encodeResourceDetail(identity),
        resource: null,
        resourceKind: null,
        tab: null,
      }),
      "detail-tab",
    );
  }, [filter, selectedResourceType]);

  const openDetailTarget = useCallback((clusterId: string, identity: ResourceIdentity) => {
    const target = encodeResourceTarget(clusterId, identity);
    filter.updateDetail(
      (current) => ({
        ...current,
        detail: null,
        full: false,
        resource: target.resource,
        resourceKind: target.kind,
        tab: null,
      }),
      "detail-open",
    );
  }, [filter]);

  const registerRowButton = useCallback(
    (identity: ResourceIdentity, element: HTMLButtonElement | null) => {
      const key = identityKey(identity);
      if (element) rowButtons.current.set(key, element);
      else rowButtons.current.delete(key);
    },
    [],
  );

  return {
    closeDetail,
    detailIdentity: detailTarget?.identity ?? null,
    detailRequested,
    detailTarget,
    openDetail,
    openDetailTarget,
    navigateDetail,
    registerRowButton,
  };
}

function identityKey(identity: ResourceIdentity): string {
  return [
    identity.resourceType,
    identity.kind,
    identity.namespace ?? "",
    identity.name,
  ].join(":");
}
