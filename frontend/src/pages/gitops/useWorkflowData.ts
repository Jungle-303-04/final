import { useCallback, useEffect, useState } from "react";
import type {
  GitOpsPort,
  ReleaseApplication,
  ReleaseCluster,
  ReleasePlan,
  ReleaseRun,
} from "../../features/gitops/gitOpsContract";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";

export interface WorkflowDataState {
  applications: ReleaseApplication[];
  clusters: ReleaseCluster[];
  plans: ReleasePlan[];
  runs: ReleaseRun[];
  loading: boolean;
  runsLoading: boolean;
  error: unknown | null;
  refresh: () => void;
  replacePlan: (plan: ReleasePlan) => void;
  replaceRun: (run: ReleaseRun) => void;
  replaceApplication: (application: ReleaseApplication) => void;
}

export function useWorkflowData(port: GitOpsPort, selectedPlanId?: string): WorkflowDataState {
  const [applications, setApplications] = useState<ReleaseApplication[]>([]);
  const [clusters, setClusters] = useState<ReleaseCluster[]>([]);
  const [plans, setPlans] = useState<ReleasePlan[]>([]);
  const [runs, setRuns] = useState<ReleaseRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    const applicationsRequest = acquireSharedRequest(
      port,
      `gitops:applications:${revision}`,
      (signal) => port.listApplications(signal),
    );
    const clustersRequest = acquireSharedRequest(
      port,
      `gitops:clusters:${revision}`,
      (signal) => port.listClusters(signal),
    );
    const plansRequest = acquireSharedRequest(
      port,
      `gitops:plans:${revision}`,
      (signal) => port.listPlans(signal),
    );
    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setError(null);
      }
    });
    void Promise.all([
      applicationsRequest.promise,
      clustersRequest.promise.catch((clusterError: unknown) => {
        if (isAbortError(clusterError)) throw clusterError;
        return [];
      }),
      plansRequest.promise,
    ]).then(([nextApplications, nextClusters, nextPlans]) => {
      if (active) {
        setApplications(nextApplications);
        setClusters(nextClusters);
        setPlans(nextPlans);
      }
    }).catch((nextError: unknown) => {
      if (active && !isAbortError(nextError)) setError(nextError);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      applicationsRequest.release();
      clustersRequest.release();
      plansRequest.release();
    };
  }, [port, revision]);

  useEffect(() => {
    if (!selectedPlanId) {
      return undefined;
    }
    let active = true;
    const request = acquireSharedRequest(
      port,
      `gitops:runs:${selectedPlanId}:r${revision}`,
      (signal) => port.listRuns(selectedPlanId, signal),
    );
    queueMicrotask(() => {
      if (active) setRunsLoading(true);
    });
    void request.promise.then((nextRuns) => {
      if (active) setRuns(nextRuns);
    }).catch((nextError: unknown) => {
      if (active && !isAbortError(nextError)) setError(nextError);
    }).finally(() => {
      if (active) setRunsLoading(false);
    });
    return () => {
      active = false;
      request.release();
    };
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

  const replaceApplication = useCallback((application: ReleaseApplication) => {
    setApplications((current) => {
      const exists = current.some((item) => item.id === application.id);
      return exists
        ? current.map((item) => item.id === application.id ? application : item)
        : [...current, application];
    });
  }, []);

  return {
    applications,
    clusters,
    plans,
    runs: selectedPlanId ? runs : [],
    loading,
    runsLoading,
    error,
    refresh,
    replacePlan,
    replaceRun,
    replaceApplication,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
