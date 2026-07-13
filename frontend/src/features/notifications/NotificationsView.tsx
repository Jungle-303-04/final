import { useEffect, useState } from 'react';
import { BellIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useConsolePath } from '@/features/console/ui';
import { useNotices } from '@/features/notifications/api';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/shared/lib/format';
import type { Tone } from '@/shared/lib/types';

const FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'approval', label: '승인' },
  { value: 'incident', label: '인시던트' },
  { value: 'dlq', label: '운영' },
  { value: 'cluster', label: '클러스터' },
] as const;

type NoticeFilter = (typeof FILTERS)[number]['value'];

const KIND_LABEL: Record<string, string> = {
  approval: '승인',
  incident: '인시던트',
  dlq: 'DLQ',
  cluster: '클러스터',
};

export default function NotificationsView() {
  const { notices, markAllSeen } = useNotices();
  const pathFor = useConsolePath();
  const [filter, setFilter] = useState<NoticeFilter>('all');

  useEffect(() => { markAllSeen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = notices.filter((notice) => filter === 'all' || notice.kind === filter);
  const currentLabel = FILTERS.find((item) => item.value === filter)?.label ?? '전체';

  return (
    <div className="grid gap-6">
      <header className="grid min-w-0 gap-1">
        <h1 className="truncate text-page font-semibold text-text-primary">인시던트</h1>
        <p className="text-body text-text-muted">인시던트, 승인 요청, 운영 이벤트를 시간순으로 확인합니다</p>
      </header>

      <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-title font-semibold text-text-primary">알림 목록</CardTitle>
          <CardDescription className="text-label text-text-muted" role="status" aria-live="polite">
            {currentLabel} {rows.length.toLocaleString()}건
          </CardDescription>
          <div className="max-w-full overflow-x-auto pt-3">
            <ToggleGroup
              value={[filter]}
              onValueChange={(values) => {
                const [nextFilter] = values;
                if (isNoticeFilter(nextFilter)) setFilter(nextFilter);
              }}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="알림 종류"
            >
              {FILTERS.map((item) => {
                const count = item.value === 'all'
                  ? notices.length
                  : notices.filter((notice) => notice.kind === item.value).length;
                return (
                  <ToggleGroupItem
                    key={item.value}
                    value={item.value}
                    aria-label={`${item.label} ${count.toLocaleString()}건`}
                  >
                    {item.label}
                    <Badge variant="secondary" className="tabular-nums">
                      {count.toLocaleString()}
                    </Badge>
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>
        </CardHeader>

        <CardContent>
          {rows.length === 0 ? (
            <div className="grid min-h-64 place-items-center gap-3 py-10 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-raised text-text-muted">
                <BellIcon className="size-5" aria-hidden="true" />
              </span>
              <div className="grid gap-1" role="status" aria-live="polite">
                <h2 className="text-title font-semibold text-text-primary">
                  {filter === 'all' ? '알림 없음' : `${currentLabel} 알림 없음`}
                </h2>
                <p className="text-body text-text-muted">새 인시던트나 승인 요청이 생기면 이곳에 표시됩니다</p>
              </div>
              {filter !== 'all' && (
                <Button type="button" size="sm" variant="outline" onClick={() => setFilter('all')}>
                  필터 초기화
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-2" role="list">
              {rows.map((notice) => (
                <article
                  key={notice.id}
                  className="grid w-full gap-3 rounded-panel border border-border bg-bg p-4 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center"
                  role="listitem"
                >
                  <Badge variant="outline" className={noticeToneClass(notice.tone)}>
                    {KIND_LABEL[notice.kind] ?? notice.kind}
                  </Badge>
                  <span className={cn(
                    'min-w-0 truncate text-body',
                    notice.read ? 'text-text-muted' : 'font-semibold text-text-primary',
                  )}>
                    {notice.title}
                  </span>
                  <time dateTime={notice.at || undefined} className="text-caption text-text-muted">
                    {notice.at ? timeAgo(notice.at) : ''}
                  </time>
                  <Button
                    render={<Link to={pathFor(notice.link)} />}
                    nativeButton={false}
                    size="sm"
                    variant="outline"
                    aria-label={`${notice.title} 바로가기`}
                  >
                    바로가기
                  </Button>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function noticeToneClass(tone: Tone) {
  if (tone === 'ok') return 'border-success/40 bg-success/10 text-success';
  if (tone === 'warn') return 'border-warning/40 bg-warning/10 text-warning';
  if (tone === 'danger') return 'border-danger/40 bg-danger/10 text-danger';
  if (tone === 'info') return 'border-info/40 bg-info/10 text-info';
  return 'border-border bg-raised text-text-muted';
}

function isNoticeFilter(value: string | undefined): value is NoticeFilter {
  return FILTERS.some((item) => item.value === value);
}
