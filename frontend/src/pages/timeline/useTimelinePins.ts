import { useCallback, useEffect, useRef, useState } from "react";
import {
  TimelineFailure,
  type TimelinePin,
  type TimelinePinSet,
  type TimelinePinTarget,
  type TimelinePort,
} from "../../features/timeline/timelineContract";
import { timelinePinTargetKey } from "../../features/timeline/timelinePinTargets";

export type TimelinePinsPhase = "disabled" | "loading" | "ready" | "forbidden" | "unavailable" | "failed";
export type TimelinePinsNotice = "added" | "removed" | "conflict" | "failed";

export interface TimelinePinsState {
  phase: TimelinePinsPhase;
  pinSet: TimelinePinSet | null;
  pendingPinId: string | null;
  pendingTargetKey: string | null;
  notice: TimelinePinsNotice | null;
}

export interface TimelinePinsController extends TimelinePinsState {
  add: (target: TimelinePinTarget) => Promise<void>;
  remove: (pin: TimelinePin) => Promise<void>;
  retry: () => void;
}

interface TimelinePinsRecord extends TimelinePinsState {
  loaded: boolean;
  workspaceCacheKey: string | undefined;
}

const DISABLED_STATE: TimelinePinsState = {
  phase: "disabled",
  pinSet: null,
  pendingPinId: null,
  pendingTargetKey: null,
  notice: null,
};

const LOADING_STATE: TimelinePinsState = {
  phase: "loading",
  pinSet: null,
  pendingPinId: null,
  pendingTargetKey: null,
  notice: null,
};

/**
 * Owns only the server-returned pin set for one active workspace. It neither
 * persists browser copies nor invents optimistic pins: a pending marker is
 * presentation-only until the mutation returns the authoritative pin set.
 */
export function useTimelinePins({
  enabled,
  port,
  workspaceCacheKey,
}: {
  enabled: boolean;
  port: TimelinePort;
  workspaceCacheKey: string | undefined;
}): TimelinePinsController {
  const [reloadToken, setReloadToken] = useState(0);
  const [record, setRecord] = useState<TimelinePinsRecord>({
    ...LOADING_STATE,
    loaded: false,
    workspaceCacheKey: undefined,
  });
  const generationRef = useRef(0);
  const mutationPendingRef = useRef(false);
  const current = enabled && record.loaded && record.workspaceCacheKey === workspaceCacheKey
    ? record
    : enabled ? LOADING_STATE : DISABLED_STATE;

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    mutationPendingRef.current = false;
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active || generationRef.current !== generation) return;
      setRecord({ ...LOADING_STATE, loaded: true, workspaceCacheKey });
      try {
        const pinSet = await port.readTimelinePins(controller.signal, workspaceCacheKey);
        if (!active || generationRef.current !== generation) return;
        setRecord({
          phase: "ready",
          pinSet,
          pendingPinId: null,
          pendingTargetKey: null,
          notice: null,
          loaded: true,
          workspaceCacheKey,
        });
      } catch (error) {
        if (!active || generationRef.current !== generation || isAbortError(error)) return;
        setRecord({ ...pinFailureState(error), loaded: true, workspaceCacheKey });
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, port, reloadToken, workspaceCacheKey]);

  const retry = useCallback(() => {
    if (enabled) setReloadToken((value) => value + 1);
  }, [enabled]);

  const refreshAfterConflict = useCallback(async (generation: number) => {
    try {
      const pinSet = await port.readTimelinePins(undefined, workspaceCacheKey);
      if (generationRef.current !== generation) return;
      setRecord({
        phase: "ready",
        pinSet,
        pendingPinId: null,
        pendingTargetKey: null,
        notice: "conflict",
        loaded: true,
        workspaceCacheKey,
      });
    } catch (error) {
      if (generationRef.current !== generation) return;
      setRecord({ ...pinFailureState(error), notice: "failed", loaded: true, workspaceCacheKey });
    }
  }, [port, workspaceCacheKey]);

  const add = useCallback(async (target: TimelinePinTarget) => {
    if (
      current.phase !== "ready"
      || current.pinSet === null
      || mutationPendingRef.current
    ) return;
    mutationPendingRef.current = true;
    const generation = generationRef.current;
    const targetKey = timelinePinTargetKey(target);
    const expectedRevision = current.pinSet.revision;
    setRecord({
      ...current,
      pendingTargetKey: targetKey,
      loaded: true,
      workspaceCacheKey,
    });
    try {
      const mutation = await port.upsertTimelinePin(
        { expectedRevision, target },
        undefined,
        workspaceCacheKey,
      );
      if (generationRef.current !== generation) return;
      setRecord({
        phase: "ready",
        pinSet: mutation.pinSet,
        pendingPinId: null,
        pendingTargetKey: null,
        notice: mutation.action === "added" || mutation.action === "unchanged" ? "added" : null,
        loaded: true,
        workspaceCacheKey,
      });
    } catch (error) {
      if (generationRef.current !== generation) return;
      if (toTimelineFailure(error).code === "conflict") {
        await refreshAfterConflict(generation);
        return;
      }
      setRecord({ ...pinFailureState(error), notice: "failed", loaded: true, workspaceCacheKey });
    } finally {
      if (generationRef.current === generation) mutationPendingRef.current = false;
    }
  }, [current, port, refreshAfterConflict, workspaceCacheKey]);

  const remove = useCallback(async (pin: TimelinePin) => {
    if (
      current.phase !== "ready"
      || current.pinSet === null
      || mutationPendingRef.current
    ) return;
    mutationPendingRef.current = true;
    const generation = generationRef.current;
    const expectedRevision = current.pinSet.revision;
    setRecord({
      ...current,
      pendingPinId: pin.pinId,
      loaded: true,
      workspaceCacheKey,
    });
    try {
      const mutation = await port.removeTimelinePin(
        pin.pinId,
        expectedRevision,
        undefined,
        workspaceCacheKey,
      );
      if (generationRef.current !== generation) return;
      setRecord({
        phase: "ready",
        pinSet: mutation.pinSet,
        pendingPinId: null,
        pendingTargetKey: null,
        notice: mutation.action === "deleted" || mutation.action === "absent" ? "removed" : null,
        loaded: true,
        workspaceCacheKey,
      });
    } catch (error) {
      if (generationRef.current !== generation) return;
      if (toTimelineFailure(error).code === "conflict") {
        await refreshAfterConflict(generation);
        return;
      }
      setRecord({ ...pinFailureState(error), notice: "failed", loaded: true, workspaceCacheKey });
    } finally {
      if (generationRef.current === generation) mutationPendingRef.current = false;
    }
  }, [current, port, refreshAfterConflict, workspaceCacheKey]);

  return { ...current, add, remove, retry };
}

function pinFailureState(error: unknown): TimelinePinsState {
  const failure = toTimelineFailure(error);
  const phase = failure.code === "forbidden"
    ? "forbidden"
    : failure.code === "unavailable" || failure.code === "invalid-request"
      ? "unavailable"
      : "failed";
  return {
    phase,
    pinSet: null,
    pendingPinId: null,
    pendingTargetKey: null,
    notice: "failed",
  };
}

function toTimelineFailure(error: unknown): TimelineFailure {
  return error instanceof TimelineFailure ? error : new TimelineFailure("unknown");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
