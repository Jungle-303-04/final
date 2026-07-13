import type { Cluster } from '@/shared/lib/types';

export type ClusterConnectionStatus = Cluster['connection_status'] | 'pending_install' | 'install_expired' | string;

export type ConnectionMeta = {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
};

const connectionMeta: Record<string, ConnectionMeta> = {
  connected: { label: '연결', tone: 'success' },
  online: { label: '연결', tone: 'success' },
  stale: { label: '지연', tone: 'warning' },
  never_connected: { label: '미연결', tone: 'warning' },
  pending_install: { label: '설치 대기', tone: 'warning' },
  install_expired: { label: '설치 만료', tone: 'danger' },
  disconnected: { label: '끊김', tone: 'danger' },
  unknown: { label: '미확인', tone: 'neutral' },
};

export const connectedStatuses = new Set<string>(['connected', 'online']);

export function clusterConnectionMeta(status: ClusterConnectionStatus | null | undefined): ConnectionMeta {
  if (!status) return connectionMeta.unknown;
  return connectionMeta[String(status)] ?? { label: String(status), tone: 'neutral' };
}

export function isClusterConnected(status: ClusterConnectionStatus | null | undefined): boolean {
  return connectedStatuses.has(String(status ?? ''));
}
