import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotices } from '@/features/notifications/api';
import { Badge, Card, EmptyState } from '@/shared/ui';
import { PageHeader } from '@/plural-ui';
import { timeAgo } from '@/shared/lib/format';
import { AnimatedList, FadeSlideIn } from '@/shared/motion';
import { IconBell } from '@/shared/ui/icons';

const FILTERS = [['all', '전체'], ['approval', '승인'], ['incident', '인시던트'], ['dlq', '운영(DLQ)'], ['cluster', '클러스터']] as const;
// 목록 배지도 필터와 같은 한국어 어휘 사용 — 셸 알림 플라이오버(NOTICE_KIND_LABEL)와 일관
const KIND_LABEL: Record<string, string> = { approval: '승인', incident: '인시던트', dlq: 'DLQ', cluster: '클러스터' };

export default function NotificationsView() {
  const { notices, markAllSeen } = useNotices();
  const [filter, setFilter] = useState<string>('all');
  useEffect(() => { markAllSeen(); /* 진입 시 워터마크 갱신 */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = notices.filter(n => filter === 'all' || n.kind === filter);

  return (
    <FadeSlideIn>
      <PageHeader title="인시던트 & 알림" sub="승인 대기·RCA 인시던트·처리 실패(DLQ) 이벤트를 한 곳에서" />
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`btn btn--sm ${filter === k ? '' : 'btn--ghost'}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      {rows.length === 0
        ? <EmptyState icon={<IconBell size={26} />}
            title={filter === 'all' ? '알림이 없습니다' : `${FILTERS.find(([k]) => k === filter)?.[1]} 알림이 없습니다`}
            description="승인 대기·RCA 인시던트·처리 실패 이벤트가 생기면 여기 모입니다" />
        : <AnimatedList items={rows} getKey={n => n.id}>{n => (
            <Card style={{ marginBottom: 8, padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
                <Badge tone={n.tone}>{KIND_LABEL[n.kind] ?? n.kind}</Badge>
                <span style={{ flex: 1, opacity: n.read ? 0.6 : 1 }}>{n.title}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{timeAgo(n.at)}</span>
                <Link to={n.link} style={{ color: 'var(--brand)' }}>바로가기 →</Link>
              </div>
            </Card>
          )}</AnimatedList>}
    </FadeSlideIn>
  );
}
