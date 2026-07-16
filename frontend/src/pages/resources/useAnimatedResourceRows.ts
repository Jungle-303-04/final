import { useEffect, useRef, useState } from "react";

import type { ResourceSummary } from "../../features/resources/resourcesContract";
import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import { MOTION_DURATION_MS } from "../../motion/useStagger";

export function useAnimatedResourceRows(targetRows: ResourceSummary[]) {
  const reducedMotion = usePrefersReducedMotion();
  const [rows, setRows] = useState(targetRows);
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const [revision, setRevision] = useState(0);
  const order = targetRows.map((item) => item.id).join("\u001f");
  const currentOrder = useRef(order);

  useEffect(() => {
    const timers: number[] = [];
    if (order === currentOrder.current || reducedMotion) {
      currentOrder.current = order;
      setRows(targetRows);
      setPhase("idle");
      return;
    }
    setPhase("leaving");
    timers.push(window.setTimeout(() => {
      currentOrder.current = order;
      setRows(targetRows);
      setRevision((current) => current + 1);
      setPhase("entering");
      timers.push(window.setTimeout(() => setPhase("idle"), MOTION_DURATION_MS.detailEnter));
    }, 90));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [order, reducedMotion, targetRows]);

  return { phase, revision, rows };
}
