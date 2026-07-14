import { useCallback, useEffect, useState } from "react";
import type {
  GitOpsPort,
  ReleaseApplication,
  ReleasePlan,
  ReleaseRun,
} from "../../features/gitops/gitOpsContract";

export interface WorkflowDataState {
  applications: ReleaseApplication[];
  plans: ReleasePlan[];
  runs: ReleaseRun[];
  loading: boolean;
  runsLoading: boolean;
  error: unknown | null;
  refresh: () => void;
  replacePlan: (plan: ReleasePlan) => void;
  replaceRun: (run: ReleaseRun) => void;
}

export function useWorkflowData(port: GitOpsPort, selectedPlanId?: string): WorkflowDataState {
  const [applications, setApplications] = useState<ReleaseApplication[]>([]);
  const [plans, setPlans] = useState<ReleasePlan[]>([]);
  const [runs, setRuns] = useState<ReleaseRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError(null);
      }
    });
    void Promise.all([
      port.listApplications(controller.signal),
      port.listPlans(controller.signal),
    ]).then(([nextApplications, nextPlans]) => {
      setApplications(nextApplications);
      setPlans(nextPlans);
    }).catch((nextError: unknown) => {
      if (!isAbortError(nextError)) setError(nextError);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [port, revision]);

  useEffect(() => {
    if (!selectedPlanId) {
      return undefined;
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setRunsLoading(true);
    });
    void port.listRuns(selectedPlanId, controller.signal).then(setRuns).catch((nextError: unknown) => {
      if (!isAbortError(nextError)) setError(nextError);
    }).finally(() => {
      if (!controller.signal.aborted) setRunsLoading(false);
    });
    return () => controller.abort();
  }, [port, revision, selectedPlanId]);

  const replacePlan = useCallback((plan: ReleasePlan) => {
    setPlans((current) => {
      const exists = current.some((item) => item.plan_id === plan.plan_id);
      return exists
        ? current.map((item) => item.plan_id === plan.plan_id ? plan : item)
        : [plan, ...current];
    });
  }, []);

  const replaceRun = useCallback((run: ReleaseRun) => {
    setRuns((current) => {
      const exists = current.some((item) => item.run_id === run.run_id);
      return exists
        ? current.map((item) => item.run_id === run.run_id ? run : item)
        : [run, ...current];
    });
  }, []);

  return {
    applications,
    plans,
    runs: selectedPlanId ? runs : [],
    loading,
    runsLoading,
    error,
    refresh,
    replacePlan,
    replaceRun,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
