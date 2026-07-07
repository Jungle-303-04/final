import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import { Button, Card, QueryBoundary } from '@/shared/ui';
import { PageHeader } from '@/plural-ui';
import { uiStore } from '@/shared/lib/ui-store';
import { FadeSlideIn, Stagger } from '@/shared/motion';
import type { CatalogItem } from '@/shared/lib/types';

export default function CatalogView() {
  const q = useQuery({ queryKey: ['catalog'], queryFn: () => get<{ items: CatalogItem[] }>('/catalog/items'), select: d => d.items });
  const install = useMutation({
    mutationFn: (id: string) => post(`/catalog/items/${id}/installs`, {}),
    onSuccess: () => uiStore.getState().toast('ok', '설치를 요청했습니다 — 진행 상황은 워크플로우에 표시됩니다'),
    onError: err => uiStore.getState().toast('danger', `설치 요청 실패 — ${(err as Error).message}`),
  });
  return (
    <FadeSlideIn>
      <PageHeader title="카탈로그" sub="설치 요청은 워크플로우 run 으로 실행됩니다" />
      <QueryBoundary query={q}>{items => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          <Stagger>{items.map(i => (
            <Card key={i.item_id} title={i.name} actions={
              /* 클릭한 카드에만 pending 표시 — 다른 카드 버튼이 같이 잠기지 않게 */
              <Button size="sm" variant="primary"
                loading={install.isPending && install.variables === i.item_id}
                disabled={install.isPending && install.variables !== i.item_id}
                onClick={() => install.mutate(i.item_id)}>설치</Button>
            }>
              <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-sm)', margin: 0 }}>{i.description}</p>
              <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{i.category}</span>
            </Card>
          ))}</Stagger>
        </div>
      )}</QueryBoundary>
    </FadeSlideIn>
  );
}
