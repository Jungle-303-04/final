import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getFleetSummary,
  getRcaTimeline,
  getSession,
  login,
  logout,
  type AuthSession,
  type FleetSummary,
  type RcaTimeline,
} from "../api";

export type ProductDataState =
  | { status: "loading" }
  | { status: "unauthenticated"; error: ApiError | null }
  | { status: "offline"; error: ApiError }
  | { status: "ready"; session: AuthSession };

export type FleetDataState =
  | { status: "loading" }
  | { status: "ready"; fleet: FleetSummary; timeline: RcaTimeline | null; timelineError: ApiError | null }
  | { status: "error"; error: ApiError };

export function useProductSession() {
  const [state, setState] = useState<ProductDataState>({ status: "loading" });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: "loading" });
    let session: AuthSession;

    try {
      session = await getSession(signal);
    } catch (error) {
      const apiError = asApiError(error, "세션을 확인할 수 없습니다.");
      setState(apiError.kind === "unauthorized"
        ? { status: "unauthenticated", error: null }
        : { status: "offline", error: apiError });
      return;
    }

    setState({ status: "ready", session });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(() => { void load(); }, [load]);

  const submitLogin = useCallback(async (email: string, password: string) => {
    setState({ status: "loading" });
    try {
      await login({ email, password });
      await load();
    } catch (error) {
      setState({ status: "unauthenticated", error: asApiError(error, "로그인할 수 없습니다.") });
    }
  }, [load]);

  const signOut = useCallback(async () => {
    await logout();
    setState({ status: "unauthenticated", error: null });
  }, []);

  return { state, refresh, submitLogin, signOut };
}

export function useFleetData() {
  const [state, setState] = useState<FleetDataState>({ status: "loading" });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: "loading" });
    const [fleetResult, timelineResult] = await Promise.allSettled([
      getFleetSummary(signal),
      getRcaTimeline(signal),
    ]);

    if (fleetResult.status === "rejected") {
      setState({
        status: "error",
        error: asApiError(fleetResult.reason, "Fleet 데이터를 불러올 수 없습니다."),
      });
      return;
    }

    setState({
      status: "ready",
      fleet: fleetResult.value,
      timeline: timelineResult.status === "fulfilled" ? timelineResult.value : null,
      timelineError: timelineResult.status === "rejected"
        ? asApiError(timelineResult.reason, "최근 운영 활동을 불러올 수 없습니다.")
        : null,
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(() => { void load(); }, [load]);
  return { state, refresh };
}

function asApiError(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError("network", fallback, { cause: error });
}
