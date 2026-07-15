import type {
  Edge,
  Node,
  ReactFlowInstance,
} from "@xyflow/react";
import { useEffect, useState, type RefObject } from "react";

export function useGraphRefit<NodeType extends Node, EdgeType extends Edge>({
  fitKey,
  instance,
  nodeCount,
  viewportRef,
}: {
  fitKey: string;
  instance: ReactFlowInstance<NodeType, EdgeType> | undefined;
  nodeCount: number;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const [viewportRevision, setViewportRevision] = useState(0);

  useEffect(() => {
    if (!instance || nodeCount === 0) return undefined;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        void instance.fitView({ padding: 0.12, minZoom: 0.4 });
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [fitKey, instance, nodeCount, viewportRevision]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
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
