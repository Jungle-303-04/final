import { useEffect, useRef, useState } from "react";

const MIN_SPIN_DURATION = 400;
const SUCCESS_DISPLAY_DURATION = 1_200;

export type RefreshPhase = "idle" | "spinning" | "success";

export function useRefreshAnimation(refreshFn: () => void | Promise<unknown>) {
  const [phase, setPhase] = useState<RefreshPhase>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const refresh = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setPhase("spinning");
    const startedAt = Date.now();
    const showSuccess = () => {
      const remaining = MIN_SPIN_DURATION - (Date.now() - startedAt);
      const finishSpin = () => {
        if (!mountedRef.current) return;
        setPhase("success");
        timeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setPhase("idle");
        }, SUCCESS_DISPLAY_DURATION);
      };
      timeoutRef.current =
        remaining > 0 ? setTimeout(finishSpin, remaining) : null;
      if (remaining <= 0) finishSpin();
    };
    try {
      const result = refreshFn();
      if (result instanceof Promise) void result.then(showSuccess, showSuccess);
      else showSuccess();
    } catch (error) {
      showSuccess();
      throw error;
    }
  };

  return { active: phase !== "idle", phase, refresh };
}
