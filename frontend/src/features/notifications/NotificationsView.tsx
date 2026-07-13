import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotices } from '@/features/notifications/api';
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from '@/ui';
import { timeAgo } from '@/shared/lib/format';
import { useConsolePath } from '@/features/console/ui';
import type { Tone } from '@/shared/lib/types';

const FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'approval', label: '승인' },
  { value: 'incident', label: '인시던트' },
  { value: 'dlq', label: '운영' },
  { value: 'cluster', label: '클러스터' },
];

const KIND_LABEL: Record<string, string> = { approval: '승인', incident: '인시던트', dlq: 'DLQ', cluster: '클러스터' };

export default function NotificationsView() {
  const { notices, markAllSeen } = useNotices();
  const pathFor = useConsolePath();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  useEffect(() => { markAllSeen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = notices.filter((notice) => filter === 'all' || notice.kind === filter);
  const currentLabel = FILTERS.find((item) => item.value === filter)?.label ?? '전체';

  return (
    <div className="grid gap-6">
      <PageHeader title="인시던트" description="인시던트, 승인 요청, 운영 이벤트를 시간순으로 확인합니다" />
      <Card title="알림 목록" description={`${currentLabel} ${rows.length.toLocaleString()}건`}>
        <div className="mb-4">
          <Tabs items={FILTERS.map((item) => ({ ...item, count: item.value === 'all' ? notices.length : notices.filter((notice) => notice.kind === item.value).length }))} value={filter} onValueChange={setFilter} />
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={<BellIcon />}
            title={filter === 'all' ? '알림 없음' : `${currentLabel} 알림 없음`}
            description="새 인시던트나 승인 요청이 생기면 이곳에 표시됩니다"
            action={filter !== 'all' ? <Button size="sm" onClick={() => setFilter('all')}>필터 초기화</Button> : undefined}
          />
        ) : (
          <div className="grid gap-2">
            {rows.map((notice) => (
              <article
                key={notice.id}
                className="grid w-full gap-3 rounded-panel border border-border bg-bg p-4 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center"
              >
                <Badge tone={toneSeverity(notice.tone)}>{KIND_LABEL[notice.kind] ?? notice.kind}</Badge>
                <span className={notice.read ? 'min-w-0 truncate text-body text-muted' : 'min-w-0 truncate text-body font-semibold text-primary'}>
                  {notice.title}
                </span>
                <span className="text-caption text-muted">{notice.at ? timeAgo(notice.at) : ''}</span>
                <Button size="sm" onClick={() => navigate(pathFor(notice.link))}>
                  바로가기
                </Button>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function toneSeverity(tone: Tone) {
  if (tone === 'ok') return 'success';
  if (tone === 'warn') return 'warning';
  if (tone === 'danger') return 'danger';
  if (tone === 'info') return 'info';
  return 'neutral';
}

function BellIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M4.5 6.8a3.5 3.5 0 0 1 7 0v2.6l1 1.8h-9l1-1.8V6.8zM6.5 13h3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}
