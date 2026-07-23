import type { AuditTimelineItem } from "../api/audit-timeline-schemas";
import type { EvidenceWindowPayload, RcaReport } from "../api/evidence-schemas";
import type { RecentChangeItem } from "../api/recent-changes-schemas";
import type { RecoveryPlan } from "../api/recovery-schemas";
import type { RemediationBundleResponse } from "../api/rca-bundle-schemas";
import type { RcaIssueItem } from "../api/schemas";

export const RCA_PREVIEW_CORRELATION_ID = "ui-preview-rca-payment-api";
export const RCA_PREVIEW_INCIDENT_ID = "ui-preview-incident-payment-api";

const now = Date.now();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export const RCA_PREVIEW_ISSUE = {
  workspace_id: "ui-preview",
  correlation_id: RCA_PREVIEW_CORRELATION_ID,
  cluster_id: "battlegrounds-live",
  incident_id: RCA_PREVIEW_INCIDENT_ID,
  incident_namespace: "payments",
  incident_resource_kind: "Deployment",
  incident_resource_name: "payment-api",
  incident_symptom: "CrashLoopBackOff",
  evidence_ref: "ui-preview-evidence-window",
  current_subject: "recovery_review_required",
  status: "recovery_planned",
  root_cause: "잘못된 데이터베이스 접속 정보",
  confidence: 0.86,
  supporting_evidence: [
    "logs:database_authentication_errors",
    "kubernetes:pod_restart_state",
    "metrics:container_restart_rate",
  ],
  missing_evidence: ["변경 승인 이력"],
  action_route: "auto",
  command_id: null,
  pr_url: null,
  error_reason: null,
  updated_at: minutesAgo(3),
  issue_severity: "critical",
  severity_availability: "available",
  severity_reason_code: null,
  situation_summary: "배포 직후 payment-api 컨테이너가 데이터베이스 인증에 실패하며 반복 재시작되었습니다.",
  recommended_action_summary: "정상 동작했던 이전 Secret 버전으로 복원한 뒤 Pod 준비 상태와 인증 오류 재발 여부를 확인합니다.",
  evidence_summary: "배포 변경, 인증 실패 로그, Pod 재시작 지표가 동일한 원인을 가리킵니다.",
  evidence_bundle_summary: "Kubernetes 상태 1건 · 오류 로그 12건 · 재시작 지표 3건",
} satisfies RcaIssueItem;

export const RCA_PREVIEW_RECENT_CHANGES = [
  {
    event_id: "ui-preview-change-payment-api",
    changed_at: minutesAgo(24),
    namespace: "payments",
    resource_kind: "Deployment",
    resource_name: "payment-api",
    image_before: "ghcr.io/opsia/payment-api:1.8.3",
    image_after: "ghcr.io/opsia/payment-api:1.9.0",
    pr_url: "https://github.com/Jungle-303-04/final/pull/605",
    commit_sha: "a1165761ac7eb3d05e164781c5b95b9fc914b084",
    repository_id: "Jungle-303-04/final",
    repo_ref: "dev",
    workflow_run_id: "deploy-payment-api-1842",
  },
] satisfies RecentChangeItem[];

export const RCA_PREVIEW_REPORT = {
  id: -1,
  workspace_id: "ui-preview",
  correlation_id: RCA_PREVIEW_CORRELATION_ID,
  root_cause: "잘못된 데이터베이스 접속 정보",
  action: "이전 Secret 버전으로 복원",
  incident_id: RCA_PREVIEW_INCIDENT_ID,
  cluster_id: "battlegrounds-live",
  symptom: "CrashLoopBackOff",
  severity: "critical",
  first_seen_at: minutesAgo(28),
  confidence: 0.86,
  reason: "Secret 변경 이후 인증 실패 로그와 컨테이너 재시작이 동시에 증가했습니다.",
  evidence_ref: "ui-preview-evidence-window",
  supporting_evidence: [
    "logs:database_authentication_errors",
    "kubernetes:pod_restart_state",
    "metrics:container_restart_rate",
  ],
  missing_evidence: ["변경 승인 이력"],
  created_at: minutesAgo(3),
  resource_kind: "Deployment",
  resource_name: "payment-api",
  namespace: "payments",
  secondary_symptoms: ["Pod 재시작 증가", "준비 상태 실패"],
  selected_candidate_id: "database_credentials_mismatch",
  candidates: [
    {
      candidate_id: "database_credentials_mismatch",
      title: "잘못된 데이터베이스 접속 정보",
      source: "evidence_pipeline",
      score: 0.86,
      reason: "인증 실패 로그와 Secret 변경 시점이 일치하며 배포 직후 재시작이 증가했습니다.",
      supporting_evidence: [
        "logs:database_authentication_errors",
        "kubernetes:pod_restart_state",
        "metrics:container_restart_rate",
      ],
      missing_evidence: ["변경 승인 이력"],
    },
    {
      candidate_id: "database_network_unavailable",
      title: "데이터베이스 네트워크 연결 실패",
      source: "evidence_pipeline",
      score: 0.57,
      reason: "연결 실패 문구는 확인됐지만 네트워크 오류를 직접 뒷받침하는 근거가 부족합니다.",
      supporting_evidence: ["kubernetes:pod_restart_state"],
      missing_evidence: ["네트워크 연결 검사", "데이터베이스 엔드포인트 상태"],
    },
  ],
  supporting_evidence_refs: [
    {
      source: "logs",
      name: "database_authentication_errors",
      check_id: "log-auth-failure",
      summary: "전체 오류 로그 12건 중 장애 발생 시점과 가깝고 인증 실패 흐름을 대표하는 로그 3건을 표시합니다.",
      query: "{namespace=\"payments\", app=\"payment-api\"} |= \"authentication failed\"",
      evidence_ref: "logs:database_authentication_errors",
      schema_version: 1,
      source_version: null,
      collector: "loki",
      collector_version: null,
      query_version: "1",
      collected_at: minutesAgo(4),
      evidence_key: "ui-preview-logs",
      source_id: "loki",
      agent_id: "ui-preview-agent",
      window_start: minutesAgo(28),
    },
    {
      source: "kubernetes",
      name: "pod_restart_state",
      check_id: "pod-restart-state",
      summary: "배포 직후 payment-api Pod의 재시작 횟수가 급증했습니다.",
      query: "namespace=payments, workload=payment-api",
      evidence_ref: "kubernetes:pod_restart_state",
      schema_version: 1,
      source_version: null,
      collector: "cluster-agent",
      collector_version: null,
      query_version: "1",
      collected_at: minutesAgo(4),
      evidence_key: "ui-preview-kubernetes",
      source_id: "kubernetes-api",
      agent_id: "ui-preview-agent",
      window_start: minutesAgo(28),
    },
    {
      source: "metrics",
      name: "container_restart_rate",
      check_id: "container-restart-rate",
      summary: "컨테이너 재시작률 지표 3개가 기준치를 초과했습니다.",
      query: "rate(kube_pod_container_status_restarts_total{namespace=\"payments\",pod=~\"payment-api.*\"}[5m])",
      evidence_ref: "metrics:container_restart_rate",
      schema_version: 1,
      source_version: null,
      collector: "prometheus",
      collector_version: null,
      query_version: "1",
      collected_at: minutesAgo(4),
      evidence_key: "ui-preview-metrics",
      source_id: "prometheus",
      agent_id: "ui-preview-agent",
      window_start: minutesAgo(28),
    },
  ],
  missing_evidence_checks: [
    {
      check_id: "change_approval_history",
      source: "gitops",
      status: "missing",
      reason: "Secret 변경 승인 기록을 확인하지 못했습니다.",
    },
  ],
  narrative: {
    locale: "ko",
    executive_summary: "배포 과정에서 변경된 데이터베이스 접속 정보로 인증이 실패해 payment-api가 반복 재시작된 것으로 판단했습니다.",
    impact: "payment-api Pod 3개 중 2개가 준비 상태에 도달하지 못해 결제 요청 처리 지연이 관측되었습니다.",
    reasoning: "배포 직후 인증 실패 로그가 시작됐고 같은 시간대에 Pod 재시작률이 증가했습니다.",
    recommended_action: "정상 동작했던 이전 Secret으로 복원하고 새 Pod의 Ready 상태와 인증 오류 재발 여부를 검증합니다.",
    recurrence_prevention: ["Secret 변경 전 연결 검증 추가", "배포 승인 단계에서 데이터베이스 접속 정보 변경 표시"],
    limitations: ["Secret 변경 승인 이력은 추가 확인이 필요합니다."],
  },
  narrative_status: "generated",
} satisfies RcaReport;

export const RCA_PREVIEW_RECOVERY_PLAN = {
  plan_id: "ui-preview-recovery-plan",
  correlation_id: RCA_PREVIEW_CORRELATION_ID,
  incident_id: RCA_PREVIEW_INCIDENT_ID,
  evidence_ref: "ui-preview-evidence-window",
  status: "selection_required",
  summary: "데이터베이스 인증 실패를 해소하기 위한 복구 후보를 비교했습니다.",
  target: {
    cluster_id: "battlegrounds-live",
    namespace: "payments",
    resource_kind: "Deployment",
    resource_name: "payment-api",
  },
  recommended_action_id: "restore-secret",
  execution_route: "auto",
  selection_required: true,
  selected_action_id: null,
  selected_by: null,
  selected_action: null,
  candidates: [
    {
      action_id: "restore-secret",
      title: "이전 Secret 버전으로 복원",
      description: "애플리케이션이 정상적으로 사용했던 이전 데이터베이스 접속 정보로 Secret을 복원합니다.",
      route: "auto",
      rank: 1,
      score: 0.92,
      risk_level: "낮음",
      blast_radius: "payment-api Deployment",
      approval_required: false,
      prerequisites: ["이전 Secret 버전 존재 여부 확인"],
      validation_checks: ["새 Pod가 Ready 상태인지 확인", "데이터베이스 인증 오류가 더 이상 발생하지 않는지 확인"],
      rollback_plan: "복원 후 문제가 지속되면 변경 전 Secret을 다시 적용하고 후속 실행을 중단합니다.",
      evidence_refs: ["logs:database_authentication_errors", "kubernetes:pod_restart_state"],
      recommendation_reason: "인증 실패 로그와 Secret 변경 시점이 일치하며 가장 작은 영향 범위로 원인을 되돌릴 수 있습니다.",
      expected_outcome: "payment-api의 데이터베이스 연결과 요청 처리가 정상화됩니다.",
      risk_explanation: "payment-api만 대상으로 하며 기존에 정상 동작한 설정으로 되돌리는 변경입니다.",
      rollback_reason: "복원 후에도 연결 상태가 악화되거나 새 오류가 발생하는 경우",
    },
    {
      action_id: "restart-deployment",
      title: "Deployment 순차 재시작",
      description: "현재 Secret을 유지한 채 payment-api Pod를 순차적으로 다시 생성합니다.",
      route: "auto",
      rank: 2,
      score: 0.61,
      risk_level: "보통",
      blast_radius: "payment-api Deployment",
      approval_required: false,
      prerequisites: [],
      validation_checks: ["모든 Pod가 Ready 상태인지 확인", "재시작 횟수가 더 증가하지 않는지 확인"],
      rollback_plan: "재시작 후 상태가 악화되면 롤아웃을 중단하고 이전 ReplicaSet으로 복원합니다.",
      evidence_refs: ["kubernetes:pod_restart_state"],
      recommendation_reason: "일시적인 시작 실패라면 재시작으로 회복할 수 있지만 인증 정보 오류는 해소하지 못할 수 있습니다.",
      expected_outcome: "일시적인 연결 문제였을 경우 Pod가 정상 상태로 복귀합니다.",
      risk_explanation: "순차 재시작 중 일부 요청 처리 용량이 감소할 수 있습니다.",
      rollback_reason: "새 Pod가 Ready 상태에 도달하지 못하는 경우",
    },
    {
      action_id: "create-safe-pr",
      title: "접속 정보 수정 PR 생성",
      description: "GitOps 저장소에 데이터베이스 접속 정보 수정안을 제안하고 검토 후 반영합니다.",
      route: "draft_pr",
      rank: 3,
      score: 0.54,
      risk_level: "낮음",
      blast_radius: "payment-api Deployment",
      approval_required: true,
      prerequisites: ["정상 데이터베이스 접속 정보 확인"],
      validation_checks: ["PR 변경 내용 검토", "병합 후 Argo CD 동기화 상태 확인"],
      rollback_plan: "변경 PR을 되돌리고 직전 정상 커밋으로 재동기화합니다.",
      evidence_refs: ["logs:database_authentication_errors"],
      recommendation_reason: "변경 이력을 Git에 남길 수 있지만 정상 접속 정보 확인과 리뷰 시간이 필요합니다.",
      expected_outcome: "검토된 접속 정보가 GitOps 흐름을 통해 안전하게 반영됩니다.",
      risk_explanation: "승인 전에는 클러스터 상태를 변경하지 않습니다.",
      rollback_reason: "배포 후 인증 오류가 지속되거나 상태가 악화되는 경우",
    },
  ],
} satisfies RecoveryPlan;

export const RCA_PREVIEW_REMEDIATION_BUNDLE = {
  meta: {
    correlation_id: RCA_PREVIEW_CORRELATION_ID,
    incident_id: RCA_PREVIEW_INCIDENT_ID,
    cluster_id: "battlegrounds-live",
    workspace_id: "ui-preview",
    created_at: minutesAgo(2),
  },
  diagnosis: {
    root_cause: "잘못된 데이터베이스 접속 정보",
    confidence: 0.86,
    supporting_evidence: RCA_PREVIEW_ISSUE.supporting_evidence,
    missing_evidence: RCA_PREVIEW_ISSUE.missing_evidence,
    supporting_evidence_refs: RCA_PREVIEW_REPORT.supporting_evidence_refs,
    missing_evidence_checks: RCA_PREVIEW_REPORT.missing_evidence_checks,
    selected_candidate_id: RCA_PREVIEW_REPORT.selected_candidate_id,
  },
  remediation: {
    status: "selection_required",
    selected_action_id: null,
    selected_by: null,
    evidence_ref: "ui-preview-evidence-window",
    candidates: RCA_PREVIEW_RECOVERY_PLAN.candidates.map((candidate) => ({
      action_id: candidate.action_id,
      title: candidate.title,
      description: candidate.description,
      route: candidate.route,
      rank: candidate.rank,
      score: candidate.score,
      risk_level: candidate.risk_level,
      blast_radius: candidate.blast_radius,
      approval_required: candidate.approval_required,
      prerequisites: candidate.prerequisites,
      validation_checks: candidate.validation_checks,
      rollback_plan: candidate.rollback_plan,
      evidence_refs: candidate.evidence_refs,
      draft: {
        action_type: candidate.action_id === "restore-secret"
          ? "restore_secret"
          : candidate.action_id === "restart-deployment"
            ? "restart_workload"
            : "create_safe_pr",
        namespace: "payments",
        resource_kind: "Deployment",
        resource_name: "payment-api",
        reason: candidate.description,
        risk_level: candidate.risk_level,
        dry_run: candidate.route !== "auto",
        source_evidence: candidate.evidence_refs,
        params: candidate.action_id === "restore-secret"
          ? { secret_name: "payment-api-db", restore_version: "previous" }
          : candidate.action_id === "restart-deployment"
            ? { strategy: "rolling", max_unavailable: 1 }
            : { repository: "Jungle-303-04/final", base_branch: "dev" },
      },
    })),
  },
} satisfies RemediationBundleResponse;

export const RCA_PREVIEW_AUDIT = [
  {
    event_id: "ui-preview-recovery-planned",
    subject: "recovery.planned",
    source: "recovery-worker",
    created_at: minutesAgo(2),
    causation_id: RCA_PREVIEW_CORRELATION_ID,
    journey_stage: "recovery",
    payload_summary: { candidate_count: 3, selection_required: true },
  },
] satisfies AuditTimelineItem[];

const previewEvidence = new Map<string, EvidenceWindowPayload>([
  ["ui-preview-logs\u0000logs", {
    evidence_key: "ui-preview-logs",
    workspace_id: "ui-preview",
    cluster_id: "battlegrounds-live",
    source: "logs",
    payload: {
      logs: [{
        matched_entries: [
          { message: "ERROR database authentication failed for configured application user" },
          { message: "ERROR application startup aborted: database connection unavailable" },
          { message: "WARN retrying database connection after authentication failure" },
        ],
      }],
    },
  }],
  ["ui-preview-kubernetes\u0000kubernetes", {
    evidence_key: "ui-preview-kubernetes",
    workspace_id: "ui-preview",
    cluster_id: "battlegrounds-live",
    source: "kubernetes",
    payload: {
      kubernetes: {
        pods: [{ name: "payment-api-7cbd8f9c8f-k2j9p", restarts: 8, ready: false }],
        events: [{ reason: "BackOff", count: 12 }],
      },
    },
  }],
  ["ui-preview-metrics\u0000metrics", {
    evidence_key: "ui-preview-metrics",
    workspace_id: "ui-preview",
    cluster_id: "battlegrounds-live",
    source: "metrics",
    payload: {
      metrics: {
        results: {
          container_restart_rate: { samples: [{ value: 0.82 }] },
          pod_ready_ratio: { samples: [{ value: 0.33 }] },
          startup_failure_total: { samples: [{ value: 12 }] },
        },
      },
    },
  }],
]);

export function isRcaPreviewCorrelation(correlationId: string | null | undefined): boolean {
  return correlationId === RCA_PREVIEW_CORRELATION_ID;
}

export function rcaPreviewEvidence(
  evidenceKey: string,
  source: string | null,
): EvidenceWindowPayload | null {
  return previewEvidence.get(`${evidenceKey}\u0000${source ?? ""}`) ?? null;
}
