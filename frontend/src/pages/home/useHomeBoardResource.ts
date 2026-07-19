import { useCallback, useEffect, useState } from "react";

export type HomeBoardResource<T> =
  | { phase: "loading" }
  | { phase: "failed"; retry: () => void }
  | { data: T; phase: "ready"; retry: () => void };

export function useHomeBoardResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[],
): HomeBoardResource<T> {
  const [retryRevision, setRetryRevision] = useState(0);
  const retry = useCallback(() => setRetryRevision((current) => current + 1), []);
  const [state, setState] = useState<HomeBoardResource<T>>({ phase: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (active) setState({ phase: "loading" });
    });
    void load(controller.signal).then(
      (data) => {
        if (active) setState({ data, phase: "ready", retry });
      },
      (error: unknown) => {
        if (active && !isAbortError(error)) setState({ phase: "failed", retry });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
    // Each caller supplies the complete request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, retryRevision]);
  return state;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
