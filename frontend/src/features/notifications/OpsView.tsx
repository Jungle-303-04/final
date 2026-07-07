import { useState } from 'react';
import { useDeadLetters, useReplayDeadLetter } from '@/features/notifications/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { timeAgo } from '@/shared/lib/format';
import type { DeadLetter } from '@/shared/lib/types';
import { Badge, Button, Card, EmptyState, KeyValueList, Modal, Table, type TableColumn } from '@/ui';

export default function OpsView() {
  const deadLettersQ = useDeadLetters(true);
  const replay = useReplayDeadLetter();
  const [confirming, setConfirming] = useState<DeadLetter | null>(null);
  const columns: TableColumn<DeadLetter>[] = [
    {
      id: 'id',
      header: 'ID',
      sortValue: (item) => item.id,
      cell: (item) => item.id,
    },
    {
      id: 'subject',
      header: 'Subject',
      width: 'lg',
      sortValue: (item) => item.original_subject,
      cell: (item) => <code className="font-mono text-caption text-secondary">{item.original_subject}</code>,
    },
    {
      id: 'consumer',
      header: 'Consumer',
      sortValue: (item) => item.consumer,
      cell: (item) => item.consumer,
    },
    {
      id: 'error',
      header: '오류',
      width: 'lg',
      cell: (item) => <span className="text-danger">{item.error}</span>,
    },
    {
      id: 'status',
      header: '상태',
      sortValue: (item) => item.status,
      cell: (item) => <Badge tone={item.status === 'open' ? 'danger' : 'success'}>{item.status === 'open' ? '열림' : '처리됨'}</Badge>,
    },
    {
      id: 'created',
      header: '발생',
      sortValue: (item) => item.created_at,
      cell: (item) => timeAgo(item.created_at) || '시간 없음',
    },
    {
      id: 'action',
      header: '',
      align: 'right',
      cell: (item) => item.status === 'open' ? (
        <Button
          size="sm"
          loading={replay.isPending && replay.variables === item.id}
          disabled={replay.isPending}
          onClick={() => setConfirming(item)}
        >
          재처리
        </Button>
      ) : null,
    },
  ];

  return (
    <SettingsNav title="운영 DLQ">
      <Card title="Dead Letter" description="처리에 실패한 이벤트를 확인하고 원인 조치 후 재처리합니다">
        <Table
          rows={deadLettersQ.data ?? []}
          columns={columns}
          rowKey={(item) => String(item.id)}
          loading={deadLettersQ.isPending}
          error={deadLettersQ.isError ? deadLettersQ.error : null}
          onRetry={() => void deadLettersQ.refetch()}
          empty={<EmptyState title="Dead Letter 없음" description="재처리가 필요한 실패 이벤트가 없습니다" />}
        />
      </Card>

      <Modal
        open={Boolean(confirming)}
        title="Dead Letter 재처리"
        description="원인이 해결된 뒤에만 같은 이벤트를 event bus로 다시 넣으세요"
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
      >
        <div className="grid gap-4">
          {confirming && (
            <div className="rounded-panel border border-border bg-bg p-4">
              <KeyValueList
                items={[
                  { label: 'ID', value: confirming.id },
                  { label: 'Subject', value: <code className="font-mono text-caption">{confirming.original_subject}</code> },
                  { label: 'Consumer', value: confirming.consumer },
                  { label: '오류', value: <span className="text-danger">{confirming.error}</span> },
                ]}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={replay.isPending}>취소</Button>
            <Button
              variant="primary"
              loading={replay.isPending}
              onClick={() => confirming && replay.mutate(confirming.id, { onSuccess: () => setConfirming(null) })}
            >
              재처리 실행
            </Button>
          </div>
        </div>
      </Modal>
    </SettingsNav>
  );
}
