import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GitOpsPort,
  ReleaseApplication,
  ReleaseCluster,
  ReleasePlan,
  ReleaseRun,
} from "../../features/gitops/gitOpsContract";
import {
  effectiveWorkflowRunStatus,
  isActiveWorkflowRun,
} from "../../features/gitops/workflowModel";
import type {
  BrowserRefreshPolicy,
  BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";

export interface WorkflowRunTransition {
  previousStatus: string | null;
  run: ReleaseRun;
  status: string;
}

export interface WorkflowDataState {
  applications: ReleaseApplication[];
  clusters: ReleaseCluster[];
  plans: ReleasePlan[];
  runs: ReleaseRun[];
  loading: boolean;
  runsLoading: boolean;
  error: unknown | null;
  runsError: unknown | null;
  refresh: () => void;
  refreshRuns: () => void;
  replacePlan: (plan: ReleasePlan) => void;
  replaceRun: (run: ReleaseRun) => void;
  replaceApplication: (application: ReleaseApplication) => void;
}

export function useWorkflowData(
  port: GitOpsPort,
  selectedPlanId: string | undefined,
  refreshPolicies: BrowserRefreshPolicyRegistry<"gitops_rows">,
  onRunTransition?: (transition: WorkflowRunTransition) => void,
): WorkflowDataState {
  const [applications, setApplications] = useState<ReleaseApplication[]>([]);
  const [clusters, setClusters] = useState<ReleaseCluster[]>([]);
  const [plans, setPlans] = useState<ReleasePlan[]>([]);
  const [runs, setRuns] = useState<ReleaseRun[]>([]);
  const [runsPlanId, setRunsPlanId] = useState("");
  const runsRef = useRef<ReleaseRun[]>([]);
  const runStatusesRef = useRef(new Map<string, string>());
  const onRunTransitionRef = useRef(onRunTransition);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [runsFailure, setRunsFailure] = useState<{
    error: unknown;
    planId: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [runsRevision, setRunsRevision] = useState(0);
  const [runPolicyRecord, setRunPolicyRecord] = useState<{
    policy: BrowserRefreshPolicy;
    registry: BrowserRefreshPolicyRegistry<"gitops_rows">;
  } | null>(null);
  const [runObservation, setRunObservation] = useState<{
    active: boolean;
    planId: string;
    sequence: number;
  } | null>(null);
  const requestRunsRefresh = useCallback(() => setRunsRevision((current) => current + 1), []);
  const runsRefresh = useServerRefreshScheduler(requestRunsRefresh);
  const commitRuns = useCallback((
    nextRuns: ReleaseRun[],
    notifyNew: boolean,
    planId: string,
  ): void => {
    for (const run of nextRuns) {
      const status = effectiveWorkflowRunStatus(run);
      const previousStatus = runStatusesRef.current.get(run.run_id);
      if (
        previousStatus !== status
        && (previousStatus !== undefined || notifyNew)
      ) {
        onRunTransitionRef.current?.({
          previousStatus: previousStatus ?? null,
          run,
          status,
        });
      }
      runStatusesRef.current.set(run.run_id, status);
    }
    runsRef.current = nextRuns;
    setRuns(nextRuns);
    setRunsPlanId(planId);
  }, []);
  const refresh = useCallback(() => {
    runsRefresh.backgroundFailure();
    setRevision((current) => current + 1);
  }, [runsRefresh]);

  useEffect(() => {
    onRunTransitionRef.current = onRunTransition;
  }, [onRunTransition]);

  useEffect(() => {
    runsRef.current = [];
    runStatusesRef.current.clear();
    runsRefresh.backgroundFailure();
  }, [selectedPlanId, runsRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshPolicies.getPolicy("gitops_rows", controller.signal).then((policy) => {
      if (!controller.signal.aborted) setRunPolicyRecord({ policy, registry: refreshPolicies });
    }).catch((policyError: unknown) => {
      if (!isAbortError(policyError)) runsRefresh.backgroundFailure();
    });
    return () => controller.abort();
  }, [refreshPolicies, runsRefresh]);

  useEffect(() => {
    const runPolicy = runPolicyRecord?.registry === refreshPolicies
      ? runPolicyRecord.policy
      : null;
    if (
      !selectedPlanId
      || runPolicy === null
      || runObservation?.planId !== selectedPlanId
      || !runObservation.active
    ) {
      runsRefresh.backgroundFailure();
      return;
    }
    runsRefresh.acceptSuccess(runPolicy);
  }, [refreshPolicies, runObservation, runPolicyRecord, runsRefresh, selectedPlanId]);

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
      `gitops:runs:${selectedPlanId}:r${revision}:p${runsRevision}`,
      (signal) => port.listRuns(selectedPlanId, signal),
    );
    queueMicrotask(() => {
      if (active) setRunsLoading(true);
    });
    void request.promise.then((nextRuns) => {
      if (active) {
        setRunsFailure((current) => current?.planId === selectedPlanId ? null : current);
        commitRuns(nextRuns, false, selectedPlanId);
        setRunObservation((current) => ({
          active: nextRuns.some(isActiveWorkflowRun),
          planId: selectedPlanId,
          sequence: (current?.sequence ?? 0) + 1,
        }));
      }
    }).catch((nextError: unknown) => {
      if (active && !isAbortError(nextError)) {
        runsRefresh.backgroundFailure();
        setRunsFailure({ error: nextError, planId: selectedPlanId });
      }
    }).finally(() => {
      if (active) setRunsLoading(false);
    });
    return () => {
      active = false;
      request.release();
    };
  }, [commitRuns, port, revision, runsRefresh, runsRevision, selectedPlanId]);

  const replacePlan = useCallback((plan: ReleasePlan) => {
    setPlans((current) => {
      const exists = current.some((item) => item.plan_id === plan.plan_id);
      return exists
        ? current.map((item) => item.plan_id === plan.plan_id ? plan : item)
        : [plan, ...current];
    });
  }, []);

  const replaceRun = useCallback((run: ReleaseRun) => {
    const exists = runsRef.current.some((item) => item.run_id === run.run_id);
    const nextRuns = exists
      ? runsRef.current.map((item) => item.run_id === run.run_id ? run : item)
      : [run, ...runsRef.current];
    const planId = selectedPlanId || run.plan_id;
    commitRuns(nextRuns, true, planId);
    setRunObservation((current) => ({
      active: nextRuns.some(isActiveWorkflowRun),
      planId,
      sequence: (current?.sequence ?? 0) + 1,
    }));
  }, [commitRuns, selectedPlanId]);

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
    runs: selectedPlanId && runsPlanId === selectedPlanId ? runs : [],
    loading,
    runsLoading,
    error,
    runsError: runsFailure && runsFailure.planId === selectedPlanId ? runsFailure.error : null,
    refresh,
    refreshRuns: requestRunsRefresh,
    replacePlan,
    replaceRun,
    replaceApplication,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
