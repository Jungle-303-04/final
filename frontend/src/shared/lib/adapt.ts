// 실백엔드 응답 형태 → 프론트 타입 정규화. mock 은 이미 프론트 형태라 통과.
// 백엔드가 필드를 덜 주면 안전한 기본값으로 채움(프론트 렌더 크래시 방지).
import type { Application, Cluster, Conversation } from '@/shared/lib/types';

export function adaptCluster(raw: Record<string, unknown>): Cluster {
  return {
    cluster_id: String(raw.cluster_id ?? ''),
    name: String(raw.name ?? raw.cluster_id ?? ''),
    environment: String(raw.environment ?? 'unknown'),
    connection_status: (raw.connection_status as Cluster['connection_status']) ?? 'unknown',
    node_count: Number(raw.node_count ?? 0),
    pod_count: Number(raw.pod_count ?? 0),
    incident_count: Number(raw.incident_count ?? 0),
    registered_at: String(raw.registered_at ?? raw.created_at ?? new Date().toISOString()),
  };
}

export function adaptApplication(raw: Record<string, unknown>): Application {
  return {
    application_id: String(raw.application_id ?? ''),
    name: String(raw.name ?? raw.application_id ?? ''),
    repo_ref: String(raw.repo_ref ?? ''),
    branch: String(raw.branch ?? 'main'),
    cluster_id: String(raw.cluster_id ?? ''),
    manifest_path: String(raw.manifest_path ?? ''),
    last_run_status: raw.last_run_status as string | undefined,
    last_deployed_at: raw.last_deployed_at as string | undefined,
  };
}

export function adaptConversationSummary(raw: Record<string, unknown>): Omit<Conversation, 'messages'> {
  return {
    conversation_id: String(raw.conversation_id ?? ''),
    title: String(raw.title ?? '대화'),
    status: (raw.status === 'waiting' ? 'waiting' : 'idle'),
    updated_at: String(raw.updated_at ?? new Date().toISOString()),
  };
}
