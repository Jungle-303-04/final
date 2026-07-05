import { useState } from 'react';
import { useDeadLetters, useReplayDeadLetter } from '@/features/notifications/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { Badge, Button, Card, Modal, QueryBoundary, ResourceTable } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/format';
import type { DeadLetter } from '@/shared/lib/types';

export default function OpsView() {
  const q = useDeadLetters(true);
  const replay = useReplayDeadLetter();
  const [confirming, setConfirming] = useState<DeadLetter | null>(null);
  return (
    <SettingsNav title="운영 (Dead Letter)">
      <Card>
        <QueryBoundary query={q}>{rows => (
          <ResourceTable rows={rows} rowKey={d => String(d.id)}
            columns={[
              { key: 'id', label: 'ID', render: d => d.id },
              { key: 'subject', label: 'Subject', render: d => <code>{d.original_subject}</code> },
              { key: 'consumer', label: 'Consumer', render: d => d.consumer },
              { key: 'error', label: '오류', render: d => d.error },
              { key: 'status', label: '상태', render: d => <Badge status={d.status} /> },
              { key: 'at', label: '발생', render: d => timeAgo(d.created_at) },
              { key: 'act', label: '', render: d => d.status === 'open' ? <Button size="sm" onClick={() => setConfirming(d)}>재처리</Button> : null },
            ]} />
        )}</QueryBoundary>
      </Card>
      <Modal open={!!confirming} title="Dead Letter 재처리" onClose={() => setConfirming(null)}>
        <p style={{ fontSize: 'var(--fs-sm)' }}>원인이 해결됐는지 확인했나요? 같은 이벤트가 event bus 로 다시 들어갑니다.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={() => setConfirming(null)}>취소</Button>
          <Button variant="primary" loading={replay.isPending}
            onClick={() => confirming && replay.mutate(confirming.id, { onSuccess: () => setConfirming(null) })}>재처리 실행</Button>
        </div>
      </Modal>
    </SettingsNav>
  );
}
