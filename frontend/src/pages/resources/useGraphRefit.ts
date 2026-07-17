import type {
  Edge,
  Node,
  ReactFlowInstance,
} from "@xyflow/react";
import { useEffect, useRef, useState, type RefObject } from "react";

const DEFAULT_GRAPH_FIT_VIEW_OPTIONS = { padding: 0.12, minZoom: 0.4 } as const;

export function useGraphRefit<NodeType extends Node, EdgeType extends Edge>({
  fitViewOptions = DEFAULT_GRAPH_FIT_VIEW_OPTIONS,
  fitKey,
  instance,
  nodeCount,
  viewportRef,
}: {
  fitViewOptions?: {
    duration?: number;
    maxZoom?: number;
    minZoom?: number;
    padding?: number;
  };
  fitKey: string;
  instance: ReactFlowInstance<NodeType, EdgeType> | undefined;
  nodeCount: number;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const [viewportRevision, setViewportRevision] = useState(0);
  const viewportSizeRef = useRef<{ height: number; width: number } | null>(null);

  useEffect(() => {
    if (!instance || nodeCount === 0) return undefined;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        void instance.fitView(fitViewOptions);
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [fitKey, fitViewOptions, instance, nodeCount, viewportRevision]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      const rect = viewport.getBoundingClientRect();
      const nextSize = {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };
      const currentSize = viewportSizeRef.current;
      if (
        currentSize?.height === nextSize.height &&
        currentSize.width === nextSize.width
      ) {
        return;
      }
      viewportSizeRef.current = nextSize;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewportRevision((revision) => revision + 1));
    });
    observer.observe(viewport);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [viewportRef]);
}
