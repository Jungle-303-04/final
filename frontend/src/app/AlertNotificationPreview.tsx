import { Activity, Boxes, CircleCheck, Server } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Route, Routes } from "react-router-dom";

import type { AlertEvent, AlertEventsPort } from "../features/alerts/alertEventsContract";
import type { AuthenticatedAuthState } from "../features/auth/authContract";
import { AuthSessionGateProvider } from "../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../features/filters/UnifiedFilterProvider";
import {
  useActivityNotifications,
} from "../features/notifications/ActivityNotificationsProvider";
import type {
  ActivityNotificationsPort,
  IncidentActivityEvent,
  SafePrActivityEvent,
} from "../features/notifications/activityNotificationsContract";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../shared/ui/primitives/card";
import { ProductShell } from "./ProductShell";
import type { ProductSurfaceId } from "./productRoutes";

const PREVIEW_SURFACES: ReadonlySet<ProductSurfaceId> = new Set([
  "home",
  "clusters",
  "resources",
  "issues",
  "alerts",
  "applications",
  "gitops",
]);

const PREVIEW_AUTH: AuthenticatedAuthState = {
  session: { userId: "preview-admin", roles: ["service_admin"], workspaceId: "default" },
  signOutIssue: null,
  signOutPending: false,
  onSignOut: () => undefined,
};

const PREVIEW_CLUSTER_SCOPE: ClusterScopePort = {
  async listClusterChoices() {
    return {
      completeness: "unknown",
      clusters: [{
        id: "cluster-1",
        workspaceId: "default",
        name: "cluster-1",
        environment: "production",
        provider: "eks",
        connectionStage: null,
        registrationState: "active",
        connectionState: "online",
        lastObservedAt: new Date().toISOString(),
        nodeCount: 2,
        podCount: 27,
        incidentCount: 0,
      }],
    };
  },
};

export function AlertNotificationPreview() {
  const alertEventsPort = useMemo(() => createPreviewAlertEventsPort(), []);
  const activityNotificationsPort = useMemo(() => createPreviewActivityNotificationsPort(), []);
  return (
    <AuthSessionGateProvider reportUnauthorized={() => undefined}>
      <UnifiedFilterProvider>
        <ClusterScopeProvider authorityKey="default:preview-admin" port={PREVIEW_CLUSTER_SCOPE}>
          <Routes>
            <Route element={(
              <ProductShell
                activityNotificationsPort={activityNotificationsPort}
                alertEventsPort={alertEventsPort}
                auth={PREVIEW_AUTH}
                releasedSurfaceIds={PREVIEW_SURFACES}
              />
            )}>
              <Route path="*" element={<PreviewClusterPage />} />
            </Route>
          </Routes>
        </ClusterScopeProvider>
      </UnifiedFilterProvider>
    </AuthSessionGateProvider>
  );
}

function PreviewClusterPage() {
  return (
    <main className="grid gap-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">클러스터</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          연결 상태와 주요 리소스를 한눈에 확인합니다.
        </p>
      </div>
      <Card className="max-w-2xl border-border/80 shadow-sm">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border bg-background">
              <Server aria-hidden="true" className="size-5" />
            </span>
            <div>
              <CardTitle>cluster-1</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">aws-test</p>
            </div>
          </div>
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
            <CircleCheck aria-hidden="true" /> 정상
          </Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <PreviewFact icon={<Activity aria-hidden="true" />} label="상태" value="연결됨" />
          <PreviewFact icon={<Server aria-hidden="true" />} label="서버" value="2" />
          <PreviewFact icon={<Boxes aria-hidden="true" />} label="파드" value="27" />
        </CardContent>
      </Card>
      <PreviewActivityControls />
    </main>
  );
}

function PreviewActivityControls() {
  const activity = useActivityNotifications();
  const sequence = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const nextId = (kind: string) => `preview-${kind}-${++sequence.current}`;
  return (
    <Card className="max-w-2xl border-dashed bg-muted/15">
      <CardHeader>
        <CardTitle className="text-base">진행 알림 미리보기</CardTitle>
        <p className="text-sm text-muted-foreground">
          버튼을 누르면 실제 상단 알림함과 우측 하단 진행 알림으로 표시됩니다.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => {
          const correlationId = nextId("analysis");
          activity.beginIncidentAnalysis({
            correlationId,
            href: "/issues/incident-preview",
            target: "payment-api",
          });
        }} type="button" variant="outline">
          인시던트 분석
        </Button>
        <Button onClick={() => {
          const correlationId = nextId("recovery");
          activity.beginIncidentRecovery({
            correlationId,
            href: "/issues/incident-preview",
            target: "payment-api",
          });
        }} type="button" variant="outline">
          복구 진행
        </Button>
        <Button onClick={() => {
          const workflowRunId = nextId("safe-pr");
          const id = activity.beginSafePr({ href: "/gitops", target: "payment-api" });
          activity.observeSafePr(id, workflowRunId, workflowRunId);
        }} type="button" variant="outline">
          Safe PR 생성
        </Button>
        <Button onClick={() => {
          const id = activity.beginAi("payment-api 장애 원인을 분석해줘");
          activity.setActivityMuted(id, false);
          timers.current.push(window.setTimeout(() => activity.completeAi(id), 3_500));
        }} type="button" variant="outline">
          백그라운드 AI
        </Button>
      </CardContent>
    </Card>
  );
}

function PreviewFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/45 p-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</span>
      <strong className="mt-1 block text-base">{value}</strong>
    </div>
  );
}

function createPreviewAlertEventsPort(): AlertEventsPort {
  const events: AlertEvent[] = [];
  return {
    async list() {
      return [...events];
    },
    async createTest() {
      const event = previewEvent(events.length + 1);
      events.unshift(event);
      return event;
    },
    async acknowledge(eventId) {
      const event = events.find((item) => item.event_id === eventId);
      if (!event) throw new Error("alert event not found");
      event.status = "acked";
      return { ...event };
    },
    async promote() {
      return { incident_id: "inc-preview-1" };
    },
  };
}

function createPreviewActivityNotificationsPort(): ActivityNotificationsPort {
  const incidentPolls = new Map<string, number>();
  const safePrPolls = new Map<string, number>();
  return {
    async loadIncidentEvents(correlationId) {
      const poll = (incidentPolls.get(correlationId) ?? 0) + 1;
      incidentPolls.set(correlationId, poll);
      const subjects = correlationId.includes("analysis")
        ? ["evidence.built", "rca.candidates.evaluated", "rca.completed", "recovery.planned"]
        : ["recovery.action_selected", "approval.requested", "command.dispatched", "command.completed", "incident.resolved"];
      return subjects.slice(0, poll).map((subject, index): IncidentActivityEvent => ({
        eventId: `${correlationId}:${subject}`,
        subject,
        createdAt: new Date(Date.now() + index).toISOString(),
        payloadSummary: {},
      }));
    },
    async loadSafePrEvents(workflowRunId) {
      const poll = (safePrPolls.get(workflowRunId) ?? 0) + 1;
      safePrPolls.set(workflowRunId, poll);
      return [
        "safe_pr.requested",
        "safe_pr.patch_prepared",
        "safe_pr.ready_for_creation",
        "safe_pr.created",
      ].slice(0, poll).map((eventType, index): SafePrActivityEvent => ({
        eventId: `${workflowRunId}:${eventType}`,
        eventType,
        message: eventType,
        createdAt: new Date(Date.now() + index).toISOString(),
        details: {},
      }));
    },
  };
}

function previewEvent(sequence: number): AlertEvent {
  const firedAt = new Date().toISOString();
  return {
    event_id: `ale-preview-${firedAt}-${sequence}`,
    rule_id: "development-notification-preview",
    rule_name: "Pod CPU 사용률 임계값 초과",
    source: "opsia",
    severity: "high",
    subject: { cluster: "cluster-1", namespace: "default", kind: "Pod", name: "api-server-0" },
    fired_at: firedAt,
    resolved_at: null,
    status: "firing",
    observed_value: 92,
    threshold: 80,
    evidence: [{
      type: "development_test",
      metric: "cpu_pct",
      observed_at: firedAt,
      subject: null,
      value: 92,
      summary: "CPU 요청량 대비 사용률 92.0%",
      link: null,
    }],
    incident_id: null,
    acknowledged_at: null,
    acknowledged_by: null,
    promoted_at: null,
    promoted_by: null,
  };
}
