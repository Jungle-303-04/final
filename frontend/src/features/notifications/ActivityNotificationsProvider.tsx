import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

import { useI18n } from "../../shared/i18n";
import { toast } from "../../shared/ui/primitives/sonner";
import type {
  ActivityNotification,
  ActivityNotificationsPort,
  IncidentActivityEvent,
  SafePrActivityEvent,
} from "./activityNotificationsContract";

const OBSERVATION_INTERVAL_MS = 2_000;
const TERMINAL_TOAST_DURATION_MS = 5_000;
const MAX_STORED_ACTIVITIES = 24;
const STORAGE_PREFIX = "opsia.activity-notifications";

interface ActivityNotificationsContextValue {
  activities: readonly ActivityNotification[];
  inboxActivities: readonly ActivityNotification[];
  notificationCount: number;
  activeCount: number;
  beginIncidentAnalysis(input: IncidentActivityInput): string;
  beginIncidentRecovery(input: IncidentActivityInput): string;
  beginSafePr(input: ActivityTargetInput): string;
  observeSafePr(id: string, correlationId: string, workflowRunId: string): void;
  beginAi(question: string): string;
  setActivityMuted(id: string, muted: boolean): void;
  completeAi(id: string): void;
  failActivity(id: string): void;
  dismissActivity(id: string): void;
  markActivityRead(id: string): void;
  markAllActivitiesRead(): void;
  openActivity(id: string): void;
  registerAiOpener(opener: () => void): () => void;
}

interface IncidentActivityInput extends ActivityTargetInput {
  correlationId: string;
}

interface ActivityTargetInput {
  target: string;
  href: string;
}

const ActivityNotificationsContext = createContext<ActivityNotificationsContextValue | null>(null);

export function ActivityNotificationsProvider({
  children,
  port,
  storageScope,
}: {
  children: ReactNode;
  port: ActivityNotificationsPort;
  storageScope: string;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const storageKey = `${STORAGE_PREFIX}:${storageScope}`;
  const [activities, setActivities] = useState<readonly ActivityNotification[]>(
    () => readStoredActivities(storageKey),
  );
  const activitiesRef = useRef(activities);
  const sequence = useRef(0);
  const aiOpener = useRef<(() => void) | null>(null);

  const commit = useCallback((next: readonly ActivityNotification[]) => {
    const sorted = sortActivities(next).slice(0, MAX_STORED_ACTIVITIES);
    activitiesRef.current = sorted;
    setActivities(sorted);
  }, []);

  const replace = useCallback((next: ActivityNotification) => {
    const current = activitiesRef.current;
    const index = current.findIndex((activity) => activity.id === next.id);
    commit(index === -1
      ? [next, ...current]
      : current.map((activity) => activity.id === next.id ? next : activity));
  }, [commit]);

  const markActivityRead = useCallback((id: string) => {
    const current = activitiesRef.current.find((activity) => activity.id === id);
    if (!current || current.read) return;
    replace({ ...current, read: true });
  }, [replace]);

  const openActivity = useCallback((id: string) => {
    const activity = activitiesRef.current.find((item) => item.id === id);
    if (!activity) return;
    if (activity.status === "succeeded" || activity.status === "failed") {
      markActivityRead(id);
    }
    if (activity.kind === "ai") {
      aiOpener.current?.();
      return;
    }
    if (activity.href) navigate(activity.href);
  }, [markActivityRead, navigate]);

  const present = useCallback((activity: ActivityNotification) => {
    if (activity.muted) {
      toast.dismiss(activity.id);
      return;
    }
    const options = {
      id: activity.id,
      description: activityDescription(activity, t),
      action: {
        label: activity.kind === "ai" ? t("alerts.activity.ai.open") : t("alerts.activity.view"),
        onClick: () => openActivity(activity.id),
      },
    };
    if (activity.status === "running") {
      toast.loading(activity.title, { ...options, duration: Infinity });
    } else if (activity.status === "waiting") {
      toast.warning(activity.title, { ...options, duration: Infinity });
    } else if (activity.status === "succeeded") {
      toast.success(activity.title, { ...options, duration: TERMINAL_TOAST_DURATION_MS });
    } else {
      toast.error(activity.title, { ...options, duration: Infinity });
    }
  }, [openActivity, t]);

  const update = useCallback((
    id: string,
    patch: Partial<ActivityNotification>,
    show = true,
  ) => {
    const current = activitiesRef.current.find((activity) => activity.id === id);
    if (!current) return;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    replace(next);
    if (show) present(next);
  }, [present, replace]);

  const beginIncidentAnalysis = useCallback((input: IncidentActivityInput) => {
    const id = `incident-analysis:${input.correlationId}`;
    const existing = activitiesRef.current.find((activity) => activity.id === id);
    if (existing) {
      present(existing);
      return id;
    }
    const now = new Date().toISOString();
    const activity: ActivityNotification = {
      id,
      kind: "incident-analysis",
      status: "running",
      title: t("alerts.activity.analysis.title", { target: input.target }),
      description: t("alerts.activity.analysis.start"),
      target: input.target,
      href: input.href,
      createdAt: now,
      updatedAt: now,
      currentStep: 1,
      totalSteps: 3,
      correlationId: input.correlationId,
      workflowRunId: null,
      lastEventId: null,
      muted: false,
      read: false,
    };
    replace(activity);
    present(activity);
    return id;
  }, [present, replace, t]);

  const beginIncidentRecovery = useCallback((input: IncidentActivityInput) => {
    const id = `incident-recovery:${input.correlationId}`;
    const now = new Date().toISOString();
    const activity: ActivityNotification = {
      id,
      kind: "incident-recovery",
      status: "running",
      title: t("alerts.activity.recovery.title", { target: input.target }),
      description: t("alerts.activity.recovery.submitting"),
      target: input.target,
      href: input.href,
      createdAt: now,
      updatedAt: now,
      currentStep: 1,
      totalSteps: 5,
      correlationId: input.correlationId,
      workflowRunId: null,
      lastEventId: null,
      muted: false,
      read: false,
    };
    replace(activity);
    present(activity);
    return id;
  }, [present, replace, t]);

  const beginSafePr = useCallback((input: ActivityTargetInput) => {
    const id = `safe-pr:${Date.now()}:${++sequence.current}`;
    const now = new Date().toISOString();
    const activity: ActivityNotification = {
      id,
      kind: "safe-pr",
      status: "running",
      title: t("alerts.activity.safePr.title", { target: input.target }),
      description: t("alerts.activity.safePr.requested"),
      target: input.target,
      href: input.href,
      createdAt: now,
      updatedAt: now,
      currentStep: 1,
      totalSteps: 4,
      correlationId: null,
      workflowRunId: null,
      lastEventId: null,
      muted: false,
      read: false,
    };
    replace(activity);
    present(activity);
    return id;
  }, [present, replace, t]);

  const beginAi = useCallback((question: string) => {
    const id = `ai:${Date.now()}:${++sequence.current}`;
    const now = new Date().toISOString();
    const activity: ActivityNotification = {
      id,
      kind: "ai",
      status: "running",
      title: t("alerts.activity.ai.title"),
      description: t("alerts.activity.ai.running"),
      target: question,
      href: null,
      createdAt: now,
      updatedAt: now,
      currentStep: 1,
      totalSteps: 1,
      correlationId: null,
      workflowRunId: null,
      lastEventId: null,
      muted: true,
      read: false,
    };
    replace(activity);
    return id;
  }, [replace, t]);

  const dismissActivity = useCallback((id: string) => {
    toast.dismiss(id);
    commit(activitiesRef.current.filter((activity) => activity.id !== id));
  }, [commit]);

  const setActivityMuted = useCallback((id: string, muted: boolean) => {
    const activity = activitiesRef.current.find((item) => item.id === id);
    if (!activity || activity.muted === muted) return;
    const next = { ...activity, muted };
    replace(next);
    if (muted) toast.dismiss(id);
    else present(next);
  }, [present, replace]);

  const completeAi = useCallback((id: string) => {
    const activity = activitiesRef.current.find((item) => item.id === id);
    if (!activity) return;
    if (activity.muted) {
      dismissActivity(id);
      return;
    }
    update(id, {
      status: "succeeded",
      title: t("alerts.activity.ai.completedTitle"),
      description: t("alerts.activity.ai.completed"),
      currentStep: 1,
      read: false,
    });
  }, [dismissActivity, t, update]);

  const failActivity = useCallback((id: string) => {
    const activity = activitiesRef.current.find((item) => item.id === id);
    if (!activity) return;
    const { description, title } = failedActivityCopy(activity, t);
    if (activity.kind === "ai" && activity.muted) {
      dismissActivity(id);
      return;
    }
    update(id, { status: "failed", description, title, read: false });
  }, [dismissActivity, t, update]);

  const observeSafePr = useCallback((
    id: string,
    correlationId: string,
    workflowRunId: string,
  ) => {
    update(id, { correlationId, workflowRunId }, false);
  }, [update]);

  const markAllActivitiesRead = useCallback(() => {
    commit(activitiesRef.current.map((activity) => (
      activity.status === "succeeded" || activity.status === "failed"
        ? { ...activity, read: true }
        : activity
    )));
  }, [commit]);

  const registerAiOpener = useCallback((opener: () => void) => {
    aiOpener.current = opener;
    return () => {
      if (aiOpener.current === opener) aiOpener.current = null;
    };
  }, []);

  const observationKey = useMemo(() => activities
    .filter(isObservedActivity)
    .map((activity) => [
      activity.id,
      activity.correlationId ?? "",
      activity.workflowRunId ?? "",
    ].join(":"))
    .join("|"), [activities]);

  useEffect(() => {
    if (!observationKey) return undefined;
    const controller = new AbortController();
    let inFlight = false;
    const observe = async () => {
      if (inFlight || controller.signal.aborted || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const observed = activitiesRef.current.filter(isObservedActivity);
        await Promise.all(observed.map(async (activity) => {
          try {
            if (activity.kind === "safe-pr" && activity.correlationId) {
              const events = await port.loadSafePrEvents(activity.correlationId, controller.signal);
              applyObservation(activity, safePrObservation(activity, events, t));
            } else if (activity.correlationId) {
              const events = await port.loadIncidentEvents(activity.correlationId, controller.signal);
              applyObservation(activity, incidentObservation(activity, events, t));
            }
          } catch (error) {
            if (isAbortError(error)) return;
            // Audit projections are eventually consistent; keep the current honest state and retry.
          }
        }));
      } finally {
        inFlight = false;
      }
    };
    const applyObservation = (
      previous: ActivityNotification,
      next: ActivityNotification | null,
    ) => {
      if (!next || next.lastEventId === previous.lastEventId) return;
      replace(next);
      present(next);
    };
    void observe();
    const interval = window.setInterval(() => void observe(), OBSERVATION_INTERVAL_MS);
    const handleVisibility = () => document.visibilityState === "visible" && void observe();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [observationKey, port, present, replace, t]);

  useEffect(() => {
    writeStoredActivities(storageKey, activities);
  }, [activities, storageKey]);

  const inboxActivities = useMemo(() => activities.filter((activity) => (
    !activity.muted && (isActive(activity) || !activity.read)
  )), [activities]);
  const activeCount = useMemo(
    () => inboxActivities.filter(isActive).length,
    [inboxActivities],
  );
  const notificationCount = useMemo(() => inboxActivities.filter((activity) => (
    isActive(activity) || !activity.read
  )).length, [inboxActivities]);

  const value = useMemo<ActivityNotificationsContextValue>(() => ({
    activities,
    inboxActivities,
    notificationCount,
    activeCount,
    beginIncidentAnalysis,
    beginIncidentRecovery,
    beginSafePr,
    observeSafePr,
    beginAi,
    setActivityMuted,
    completeAi,
    failActivity,
    dismissActivity,
    markActivityRead,
    markAllActivitiesRead,
    openActivity,
    registerAiOpener,
  }), [
    activeCount,
    activities,
    beginAi,
    beginIncidentAnalysis,
    beginIncidentRecovery,
    beginSafePr,
    completeAi,
    dismissActivity,
    failActivity,
    inboxActivities,
    markActivityRead,
    markAllActivitiesRead,
    notificationCount,
    observeSafePr,
    openActivity,
    registerAiOpener,
    setActivityMuted,
  ]);

  return (
    <ActivityNotificationsContext.Provider value={value}>
      {children}
    </ActivityNotificationsContext.Provider>
  );
}

export function useActivityNotifications(): ActivityNotificationsContextValue {
  const value = useContext(ActivityNotificationsContext);
  if (!value) throw new Error("useActivityNotifications must be used within ActivityNotificationsProvider");
  return value;
}

export function useOptionalActivityNotifications(): ActivityNotificationsContextValue | null {
  return useContext(ActivityNotificationsContext);
}

function incidentObservation(
  activity: ActivityNotification,
  events: readonly IncidentActivityEvent[],
  t: ReturnType<typeof useI18n>["t"],
): ActivityNotification | null {
  const recognized = events.filter((event) => incidentSubjects(activity.kind).has(event.subject));
  const latest = recognized[recognized.length - 1];
  if (!latest) return null;
  const base = { ...activity, lastEventId: latest.eventId, updatedAt: latest.createdAt, read: false };
  if (activity.kind === "incident-analysis") {
    if (["rca.analysis_blocked", "rca.action_required", "rca.rule_missing"].includes(latest.subject)) {
      return {
        ...base,
        status: "waiting",
        title: t("alerts.activity.analysis.actionRequiredTitle", { target: activity.target }),
        currentStep: 3,
        description: t("alerts.activity.analysis.actionRequired"),
      };
    }
    if (latest.subject === "recovery.planned") {
      return {
        ...base,
        status: "succeeded",
        title: t("alerts.activity.analysis.completedTitle", { target: activity.target }),
        currentStep: 3,
        description: t("alerts.activity.analysis.ready"),
      };
    }
    if (latest.subject === "rca.completed") {
      return { ...base, status: "running", currentStep: 3, description: t("alerts.activity.analysis.rca") };
    }
    if (latest.subject.startsWith("rca.candidates.")) {
      return { ...base, status: "running", currentStep: 2, description: t("alerts.activity.analysis.evidence") };
    }
    return { ...base, status: "running", currentStep: 1, description: t("alerts.activity.analysis.start") };
  }
  if (["command.rejected", "safe_pr.failed", "workflow.failed"].includes(latest.subject)) {
    return {
      ...base,
      status: "failed",
      title: t("alerts.activity.recovery.failedTitle", { target: activity.target }),
      description: t("alerts.activity.recovery.failed"),
    };
  }
  if (latest.subject === "incident.resolved") {
    return {
      ...base,
      status: "succeeded",
      title: t("alerts.activity.recovery.completedTitle", { target: activity.target }),
      currentStep: 5,
      description: t("alerts.activity.recovery.completed"),
    };
  }
  if (latest.subject === "safe_pr.created") {
    return {
      ...base,
      status: "succeeded",
      title: t("alerts.activity.safePr.completedTitle", { target: activity.target }),
      currentStep: 5,
      description: t("alerts.activity.safePr.completed"),
    };
  }
  if (latest.subject.startsWith("safe_pr.")) {
    return { ...base, status: "running", currentStep: 4, description: safePrDescription(latest.subject, t) };
  }
  if (latest.subject === "command.completed") {
    return { ...base, status: "running", currentStep: 4, description: t("alerts.activity.recovery.verifying") };
  }
  if (["command.requested", "command.dispatched", "command.queued_for_agent"].includes(latest.subject)) {
    return { ...base, status: "running", currentStep: 3, description: t("alerts.activity.recovery.executing") };
  }
  if (["approval.recommended", "approval.requested"].includes(latest.subject)) {
    return { ...base, status: "waiting", currentStep: 2, description: t("alerts.activity.recovery.approval") };
  }
  return { ...base, status: "running", currentStep: 1, description: t("alerts.activity.recovery.submitting") };
}

function safePrObservation(
  activity: ActivityNotification,
  events: readonly SafePrActivityEvent[],
  t: ReturnType<typeof useI18n>["t"],
): ActivityNotification | null {
  const recognized = [...events]
    .filter((event) => safePrSubjects.has(event.eventType))
    .sort((left, right) => Date.parse(left.createdAt ?? "") - Date.parse(right.createdAt ?? ""));
  const latest = recognized[recognized.length - 1];
  if (!latest) return null;
  const base = {
    ...activity,
    lastEventId: latest.eventId,
    updatedAt: latest.createdAt ?? new Date().toISOString(),
    read: false,
  };
  if (latest.eventType === "safe_pr.failed") {
    return {
      ...base,
      status: "failed",
      title: t("alerts.activity.safePr.failedTitle", { target: activity.target }),
      description: t("alerts.activity.safePr.failed"),
    };
  }
  if (latest.eventType === "safe_pr.created") {
    return {
      ...base,
      status: "succeeded",
      title: t("alerts.activity.safePr.completedTitle", { target: activity.target }),
      currentStep: 4,
      description: t("alerts.activity.safePr.completed"),
    };
  }
  const currentStep = latest.eventType === "safe_pr.ready_for_creation"
    ? 3
    : latest.eventType === "safe_pr.patch_prepared"
      ? 2
      : 1;
  return {
    ...base,
    status: "running",
    currentStep,
    description: safePrDescription(latest.eventType, t),
  };
}

function safePrDescription(subject: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (subject === "safe_pr.patch_prepared") return t("alerts.activity.safePr.patch");
  if (subject === "safe_pr.ready_for_creation") return t("alerts.activity.safePr.ready");
  return t("alerts.activity.safePr.requested");
}

const safePrSubjects = new Set([
  "safe_pr.requested",
  "safe_pr.patch_prepared",
  "safe_pr.ready_for_creation",
  "safe_pr.created",
  "safe_pr.failed",
]);

function incidentSubjects(kind: ActivityNotification["kind"]): ReadonlySet<string> {
  return kind === "incident-analysis" ? analysisSubjects : recoverySubjects;
}

const analysisSubjects = new Set([
  "incident.detected",
  "evidence.built",
  "evidence.bundle.built",
  "rca.candidates.planned",
  "rca.candidates.evaluated",
  "rca.completed",
  "rca.analysis_blocked",
  "rca.action_required",
  "rca.rule_missing",
  "recovery.planned",
]);

const recoverySubjects = new Set([
  "recovery.action_selected",
  "approval.recommended",
  "approval.requested",
  "command.requested",
  "command.dispatched",
  "command.queued_for_agent",
  "command.completed",
  "command.rejected",
  "safe_pr.requested",
  "safe_pr.patch_prepared",
  "safe_pr.ready_for_creation",
  "safe_pr.created",
  "safe_pr.failed",
  "workflow.failed",
  "incident.resolved",
]);

function activityDescription(
  activity: ActivityNotification,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return activity.totalSteps > 1
    ? `${activity.description} · ${t("alerts.activity.step", {
        current: activity.currentStep,
        total: activity.totalSteps,
      })}`
    : activity.description;
}

function failedActivityCopy(
  activity: ActivityNotification,
  t: ReturnType<typeof useI18n>["t"],
): Pick<ActivityNotification, "description" | "title"> {
  if (activity.kind === "safe-pr") {
    return {
      title: t("alerts.activity.safePr.failedTitle", { target: activity.target }),
      description: t("alerts.activity.safePr.failed"),
    };
  }
  if (activity.kind === "ai") {
    return {
      title: t("alerts.activity.ai.failedTitle"),
      description: t("alerts.activity.ai.failed"),
    };
  }
  return {
    title: t("alerts.activity.recovery.failedTitle", { target: activity.target }),
    description: t("alerts.activity.recovery.failed"),
  };
}

function isObservedActivity(activity: ActivityNotification): boolean {
  return isActive(activity) && activity.kind !== "ai" && (
    (activity.kind === "safe-pr" && activity.correlationId !== null) ||
    (activity.kind !== "safe-pr" && activity.correlationId !== null)
  );
}

function isActive(activity: ActivityNotification): boolean {
  return activity.status === "running" || activity.status === "waiting";
}

function sortActivities(activities: readonly ActivityNotification[]): ActivityNotification[] {
  return [...activities].sort((left, right) => (
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  ));
}

function readStoredActivities(key: string): readonly ActivityNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredActivity).filter((activity) => activity.kind !== "ai");
  } catch {
    return [];
  }
}

function writeStoredActivities(key: string, activities: readonly ActivityNotification[]): void {
  try {
    const persistent = activities.filter((activity) => activity.kind !== "ai");
    window.sessionStorage.setItem(key, JSON.stringify(persistent));
  } catch {
    // Storage may be unavailable in private contexts; in-memory tracking still works.
  }
}

function isStoredActivity(value: unknown): value is ActivityNotification {
  if (typeof value !== "object" || value === null) return false;
  const activity = value as Partial<ActivityNotification>;
  return typeof activity.id === "string" &&
    typeof activity.kind === "string" &&
    typeof activity.status === "string" &&
    typeof activity.title === "string" &&
    typeof activity.description === "string" &&
    typeof activity.target === "string" &&
    typeof activity.createdAt === "string" &&
    typeof activity.updatedAt === "string" &&
    typeof activity.currentStep === "number" &&
    typeof activity.totalSteps === "number" &&
    typeof activity.muted === "boolean" &&
    typeof activity.read === "boolean";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
