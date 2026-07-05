import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotices } from '@/features/notifications/api';
import { Badge, Card, EmptyState } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/format';
import { FadeSlideIn, Stagger } from '@/shared/motion';

const FILTERS = [['all', '전체'], ['approval', '승인'], ['incident', '인시던트'], ['dlq', '운영(DLQ)'], ['cluster', '클러스터']] as const;

export default function NotificationsView() {
  const { notices, markAllSeen } = useNotices();
  const [filter, setFilter] = useState<string>('all');
  useEffect(() => { markAllSeen(); /* 진입 시 워터마크 갱신 */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = notices.filter(n => filter === 'all' || n.kind === filter);

  return (
    <FadeSlideIn>
      <h1 style={{ marginTop: 0, fontSize: 'var(--fs-xl)' }}>알림</h1>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`btn btn--sm ${filter === k ? '' : 'btn--ghost'}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      {rows.length === 0
        ? <EmptyState icon="🔕" title="알림이 없습니다" />
        : <Stagger>{rows.map(n => (
            <Card key={n.id} style={{ marginBottom: 8, padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
                <Badge tone={n.tone}>{n.kind}</Badge>
                <span style={{ flex: 1, opacity: n.read ? 0.6 : 1 }}>{n.title}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{timeAgo(n.at)}</span>
                <Link to={n.link} style={{ color: 'var(--brand)' }}>바로가기 →</Link>
              </div>
            </Card>
          ))}</Stagger>}
    </FadeSlideIn>
  );
}
