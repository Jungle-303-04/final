import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export type DimensionAxis = "width" | "height";

export interface DimensionBounds {
  max: number;
  min: number;
  step: number;
}

interface ActiveDimensionPreview {
  cancel(): void;
}

interface UseRafDimensionPreviewOptions extends DimensionBounds {
  /** The host whose in-flow dimension is being previewed. */
  hostRef: RefObject<HTMLElement | null>;
  /** CSS custom property used by the host's dimension token. */
  previewProperty: `--${string}`;
  /** Width uses clientX; height uses clientY. */
  axis: DimensionAxis;
  /** Commit exactly one snapped value after a completed pointer gesture. */
  onCommit: (value: number) => void;
  /** Resize direction for an edge handle. The product's end-edge handles grow while moving up/left. */
  deltaMultiplier?: 1 | -1;
}

/**
 * Keeps continuous dimension previews outside React while preserving an
 * in-flow region's real size. A gesture writes one CSS custom property per
 * animation frame, then commits a snapped value once on pointerup.
 */
export function useRafDimensionPreview({
  axis,
  deltaMultiplier = -1,
  hostRef,
  max,
  min,
  onCommit,
  previewProperty,
  step,
}: UseRafDimensionPreviewOptions) {
  const activePreview = useRef<ActiveDimensionPreview | null>(null);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => () => activePreview.current?.cancel(), []);

  const clamp = useCallback((value: number) => (
    clampDimension(value, { max, min, step })
  ), [max, min, step]);

  const beginPointerPreview = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    value: number,
  ) => {
    if (event.button !== 0) return;
    const host = hostRef.current;
    if (host === null) return;

    event.preventDefault();
    activePreview.current?.cancel();

    const pointerId = event.pointerId;
    const target = event.currentTarget;
    const startCoordinate = coordinateFor(axis, event);
    const startValue = value;
    let draftValue = startValue;
    let previewFrame: number | null = null;
    let settleFrame: number | null = null;
    let completed = false;
    let captured = false;

    if (typeof target.setPointerCapture === "function") {
      target.setPointerCapture(pointerId);
      captured = true;
    }
    host.dataset.resizing = "true";

    const clearPreviewFrame = () => {
      if (previewFrame === null) return;
      cancelAnimationFrame(previewFrame);
      previewFrame = null;
    };
    const removeListeners = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancelPointer);
    };
    const releasePointerCapture = () => {
      if (!captured) return;
      captured = false;
      if (typeof target.hasPointerCapture !== "function" || target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture?.(pointerId);
      }
    };
    const restoreHost = () => {
      clearPreviewFrame();
      if (settleFrame !== null) cancelAnimationFrame(settleFrame);
      settleFrame = null;
      host.style.removeProperty(previewProperty);
      delete host.dataset.resizing;
    };
    const preview = () => {
      previewFrame = null;
      host.style.setProperty(previewProperty, `${draftValue}px`);
    };
    const queuePreview = () => {
      if (previewFrame !== null) return;
      previewFrame = requestAnimationFrame(preview);
    };
    const previewAt = (next: globalThis.PointerEvent) => {
      const coordinate = coordinateFor(axis, next);
      return clampPreview(startValue + (coordinate - startCoordinate) * deltaMultiplier, min, max);
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      draftValue = previewAt(next);
      queuePreview();
    };
    const finish = (next: globalThis.PointerEvent) => {
      if (completed || next.pointerId !== pointerId) return;
      completed = true;
      removeListeners();
      releasePointerCapture();
      draftValue = previewAt(next);
      clearPreviewFrame();
      host.style.setProperty(previewProperty, `${draftValue}px`);

      const committedValue = clamp(draftValue);
      host.dataset[axis] = `${committedValue}`;
      onCommitRef.current(committedValue);
      settleFrame = requestAnimationFrame(() => {
        settleFrame = null;
        restoreHost();
        if (activePreview.current === session) activePreview.current = null;
      });
    };
    const cancel = () => {
      if (!completed) {
        completed = true;
        removeListeners();
        releasePointerCapture();
      }
      restoreHost();
      if (activePreview.current === session) activePreview.current = null;
    };
    const cancelPointer = (next: globalThis.PointerEvent) => {
      if (next.pointerId === pointerId) cancel();
    };
    const session: ActiveDimensionPreview = { cancel };

    activePreview.current = session;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancelPointer);
  }, [axis, clamp, deltaMultiplier, hostRef, max, min, previewProperty]);

  return { beginPointerPreview, clamp };
}

export function clampDimension(value: number, { max, min, step }: DimensionBounds): number {
  if (!Number.isFinite(value)) throw new TypeError("dimension value must be finite");
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    throw new RangeError("dimension bounds must be finite and ordered");
  }
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("dimension step must be positive");
  const stepped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, stepped));
}

function clampPreview(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function coordinateFor(axis: DimensionAxis, event: Pick<globalThis.PointerEvent, "clientX" | "clientY">): number {
  return axis === "width" ? event.clientX : event.clientY;
}
