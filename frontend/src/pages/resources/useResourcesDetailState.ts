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
  decodeResourceTarget,
  encodeResourceTarget,
  isCanonicalResourceTarget,
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
    filter.detail.resource !== null || filter.detail.resourceKind !== null;
  const detailTarget = useMemo(
    () =>
      decodeResourceTarget(
        selectedClusterId,
        selectedResourceType,
        filter.detail.resourceKind,
        filter.detail.resource,
      ),
    [
      filter.detail.resource,
      filter.detail.resourceKind,
      selectedClusterId,
      selectedResourceType,
    ],
  );

  useEffect(() => {
    if (
      detailTarget === null ||
      isCanonicalResourceTarget(filter.detail.resource)
    )
      return;
    const selection = encodeResourceTarget(
      detailTarget.clusterId,
      detailTarget.identity,
    );
    filter.updateDetail(
      (current) => ({
        ...current,
        resource: selection.resource,
        resourceKind: selection.kind,
      }),
      "detail-expand",
    );
  }, [detailTarget, filter]);

  const closeDetail = useCallback(() => {
    setRetryBlocks((current) => withoutRetryBlock(current, "detail"));
    const key = restoreRowKey.current;
    restoreRowKey.current = null;
    filter.updateDetail(
      (current) => ({
        ...current,
        full: false,
        resource: null,
        resourceKind: null,
        tab: null,
      }),
      "detail-close",
    );
    requestAnimationFrame(() => {
      if (key) rowButtons.current.get(key)?.focus();
    });
  }, [filter, setRetryBlocks]);

  const openDetail = useCallback(
    (identity: ResourceIdentity) => {
      if (selectedClusterId === null) return;
      const selection = encodeResourceTarget(selectedClusterId, identity);
      restoreRowKey.current = identityKey(identity);
      filter.updateDetail(
        (current) => ({
          ...current,
          full: false,
          resource: selection.resource,
          resourceKind: selection.kind,
          tab: null,
        }),
        "detail-open",
      );
    },
    [filter, selectedClusterId],
  );

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
