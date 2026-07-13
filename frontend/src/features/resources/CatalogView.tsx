import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { get, post } from '@/shared/lib/api';
import type { CatalogItem } from '@/shared/lib/types';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, cx, useToast } from '@/ui';
import { listItem, listStagger } from '@/ui/motion';

const CATALOG_QUERY_TIMEOUT_MS = 8_000;

type CatalogItemView = CatalogItem & {
  slug?: string | null;
  default_version?: string | null;
  status?: string | null;
  metadata?: {
    tags?: unknown;
    [key: string]: unknown;
  } | null;
};

type CatalogInstallResponse = {
  install?: {
    install_id?: string;
    status?: string;
    [key: string]: unknown;
  };
};

export default function CatalogView() {
  const toast = useToast();
  const catalogQ = useQuery({
    queryKey: ['catalog'],
    queryFn: () => get<{ items: CatalogItemView[] }>('/catalog/items', { timeoutMs: CATALOG_QUERY_TIMEOUT_MS }),
    retry: false,
    select: data => data.items,
  });
  const install = useMutation({
    mutationFn: (item: CatalogItemView) => post<CatalogInstallResponse>(`/catalog/items/${encodeURIComponent(item.item_id)}/installs`, {
      application_name: applicationName(item),
      values: {},
    }),
    onSuccess: (data, item) => {
      toast.push({
        tone: 'success',
        title: '설치 요청 등록',
        description: `${item.name} 설치 계획을 생성했습니다${data.install?.install_id ? ` · ${data.install.install_id}` : ''}`,
      });
    },
    onError: (error, item) => {
      toast.push({
        tone: 'danger',
        title: '설치 요청 실패',
        description: `${item.name}: ${(error as Error).message || '잠시 후 다시 시도해주세요'}`,
      });
    },
  });
  const items = catalogQ.data ?? [];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="카탈로그"
        description="검증된 레시피를 설치 요청으로 등록하고 후속 워크플로우에서 승인·적용합니다"
      />

      {catalogQ.isPending ? (
        <CatalogSkeleton />
      ) : catalogQ.isError ? (
        <Card>
          <EmptyState
            icon={<CatalogIcon />}
            title="카탈로그 조회 실패"
            description={catalogQ.error.message || '설치 항목을 불러오지 못했습니다'}
            action={<Button size="sm" onClick={() => catalogQ.refetch()}>다시 시도</Button>}
          />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CatalogIcon />}
            title="설치 항목 없음"
            description="현재 워크스페이스에서 설치할 수 있는 카탈로그 항목이 없습니다"
            action={<Button size="sm" onClick={() => catalogQ.refetch()}>새로고침</Button>}
          />
        </Card>
      ) : (
        <motion.div variants={listStagger} initial="initial" animate="animate" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const pending = install.isPending && install.variables?.item_id === item.item_id;
            const otherPending = install.isPending && install.variables?.item_id !== item.item_id;
            return (
              <motion.div key={item.item_id} variants={listItem} layout className="min-w-0">
                <Card
                  title={item.name}
                  description={item.description}
                  actions={<Button size="sm" variant="primary" loading={pending} disabled={otherPending} onClick={() => install.mutate(item)}>설치 요청</Button>}
                  className="h-full"
                >
                  <div className="grid gap-4">
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Badge tone={categoryTone(item.category)}>{categoryLabel(item.category)}</Badge>
                      {item.default_version && <Badge tone="neutral">v{item.default_version}</Badge>}
                      {item.status && item.status !== 'active' && <Badge tone="warning">{item.status}</Badge>}
                    </div>
                    <div className="grid gap-2 text-body">
                      <MetaRow label="식별자" value={item.slug || item.item_id} mono />
                      <MetaRow label="설치 이름" value={applicationName(item)} mono />
                    </div>
                    <TagList tags={tagsOf(item)} />
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <Card key={index}>
          <Skeleton lines={5} />
        </Card>
      ))}
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="w-20 shrink-0 text-caption font-medium text-muted">{label}</span>
      <span className={cx('min-w-0 flex-1 truncate text-caption text-secondary', mono && 'font-mono')}>{value || '없음'}</span>
    </div>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-caption text-muted">태그 없음</span>;
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {tags.map((tag) => <span key={tag} className="rounded-control border border-border bg-raised px-2 py-1 text-caption text-secondary">{tag}</span>)}
    </div>
  );
}

function tagsOf(item: CatalogItemView): string[] {
  const raw = item.metadata?.tags;
  return Array.isArray(raw) ? raw.map(String).filter(Boolean).slice(0, 4) : [];
}

function applicationName(item: CatalogItemView) {
  const source = item.slug || item.name || item.item_id;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || item.item_id;
}

function categoryLabel(category: string) {
  const key = category.toLowerCase();
  if (key === 'database') return '데이터베이스';
  if (key === 'application') return '애플리케이션';
  if (key === 'cache') return '캐시';
  return category || '분류 없음';
}

function categoryTone(category: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  const key = category.toLowerCase();
  if (key === 'database') return 'info';
  if (key === 'application') return 'success';
  if (key === 'cache') return 'warning';
  return 'neutral';
}

function CatalogIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M3 4.5 8 2l5 2.5v7L8 14l-5-2.5v-7Zm5 2.4 5-2.4M8 6.9 3 4.5m5 2.4V14" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}
