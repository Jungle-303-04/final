import { useNavigate } from 'react-router-dom';
import { useApplications, useRunsAll } from '@/features/repo/api';
import { shortSha, timeAgo } from '@/shared/lib/format';
import type { WorkflowRun } from '@/shared/lib/types';
import { useConsolePath } from '@/features/console/ui';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, Table } from '@/ui';

const ACTIVE = new Set(['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING']);

type WorkflowRow = WorkflowRun & { appId: string };
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export default function WorkflowListView() {
  const apps = useApplications();
  const all = useRunsAll(apps.data ?? []);
  const nav = useNavigate();
  const pathFor = useConsolePath();
  const rows = all.items
    .flatMap(({ appId, runs }) => runs.map((run) => ({ ...run, appId })))
    .sort((a, b) => Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status)) || (b.started_at ?? '').localeCompare(a.started_at ?? ''));
  const loading = apps.isPending || ((apps.data ?? []).length > 0 && all.pending);
  const error = apps.error ?? all.error;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="워크플로우"
        description="변경 감지부터 렌더, 정책 검증, 승인, 적용까지 이어지는 실행 흐름입니다."
        actions={<Button onClick={() => nav(pathFor('/release-flows'))}>릴리즈 플로우 보기</Button>}
      />

      <Card>
        {loading ? (
          <Skeleton lines={6} />
        ) : apps.isError || all.failed ? (
          <EmptyState
            title="워크플로우 조회 실패"
            description={(error as Error | undefined)?.message ?? '실행 목록을 불러오지 못했습니다.'}
            action={<Button size="sm" onClick={() => apps.refetch()}>다시 시도</Button>}
          />
        ) : (
          <Table
            rows={rows}
            rowKey={(row) => row.run_id}
            onRowClick={(row) => nav(pathFor(`/workflows/${row.run_id}`))}
            empty={(
              <EmptyState
                title="아직 실행된 워크플로우가 없습니다"
                description="릴리즈 플로우에서 실행을 시작하면 렌더, 검증, 승인, 적용 기록이 여기에 표시됩니다."
                action={<Button size="sm" onClick={() => nav(pathFor('/release-flows'))}>릴리즈 플로우 열기</Button>}
              />
            )}
            columns={[
              {
                id: 'app',
                header: '앱',
                cell: (row: WorkflowRow) => <span className="font-semibold text-primary">{row.appId}</span>,
                sortValue: (row) => row.appId,
                width: 'md',
              },
              {
                id: 'sha',
                header: '커밋',
                cell: (row) => <CodeText>{shortSha(row.commit_sha)}</CodeText>,
                sortValue: (row) => shortSha(row.commit_sha),
                width: 'sm',
              },
              {
                id: 'status',
                header: '상태',
                cell: (row) => <WorkflowStatusBadge status={row.status} />,
                sortValue: (row) => row.status,
                width: 'md',
              },
              {
                id: 'step',
                header: '현재 단계',
                cell: (row) => <span className="text-secondary">{workflowStatusLabel(row.current_step || row.status)}</span>,
                sortValue: (row) => row.current_step || row.status,
              },
              {
                id: 'at',
                header: '시작',
                cell: (row) => <span title={row.started_at}>{timeAgo(row.started_at)}</span>,
                sortValue: (row) => row.started_at,
                width: 'sm',
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

function WorkflowStatusBadge({ status }: { status: string }) {
  const meta = workflowStatusMeta(status);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function workflowStatusMeta(status: string): { label: string; tone: BadgeTone } {
  const key = status.toUpperCase();
  if (['SUCCEEDED', 'COMPLETED', 'DONE', 'APPROVED', 'GRANTED'].includes(key)) return { label: '완료', tone: 'success' };
  if (['FAILED', 'REJECTED', 'ERROR'].includes(key)) return { label: '실패', tone: 'danger' };
  if (key === 'WAITING_FOR_APPROVAL') return { label: '승인 대기', tone: 'warning' };
  if (ACTIVE.has(key)) return { label: workflowStatusLabel(key), tone: 'info' };
  if (key === 'PENDING') return { label: '대기', tone: 'neutral' };
  return { label: status || '미확인', tone: 'neutral' };
}

function workflowStatusLabel(status: string) {
  const key = status.toUpperCase();
  return {
    STARTED: '시작',
    RENDERING: '렌더링',
    DIFFING: '변경 계산',
    POLICY_CHECKING: '정책 검증',
    WAITING_FOR_APPROVAL: '승인 대기',
    APPLYING: '적용 중',
    ROLLOUT_WAITING: '롤아웃 확인',
    SUCCEEDED: '완료',
    FAILED: '실패',
    PENDING: '대기',
  }[key] ?? (status || '미확인');
}

function CodeText({ children }: { children: string }) {
  return <code className="inline-flex max-w-full truncate rounded-control border border-border bg-raised px-2 py-1 font-mono text-caption text-secondary">{children}</code>;
}
