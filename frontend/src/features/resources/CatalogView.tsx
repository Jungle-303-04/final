import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import { Button, Card, QueryBoundary } from '@/shared/ui';
import { uiStore } from '@/shared/lib/ui-store';
import { FadeSlideIn, Stagger } from '@/shared/motion';
import type { CatalogItem } from '@/shared/lib/types';

export default function CatalogView() {
  const q = useQuery({ queryKey: ['catalog'], queryFn: () => get<{ items: CatalogItem[] }>('/catalog/items'), select: d => d.items });
  const install = useMutation({
    mutationFn: (id: string) => post(`/catalog/items/${id}/installs`, {}),
    onSuccess: () => uiStore.getState().toast('ok', '설치를 요청했습니다'),
  });
  return (
    <FadeSlideIn>
      <h1 style={{ marginTop: 0, fontSize: 'var(--fs-xl)' }}>카탈로그</h1>
      <QueryBoundary query={q}>{items => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          <Stagger>{items.map(i => (
            <Card key={i.item_id} title={i.name} actions={<Button size="sm" variant="primary" loading={install.isPending} onClick={() => install.mutate(i.item_id)}>설치</Button>}>
              <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-sm)', margin: 0 }}>{i.description}</p>
              <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{i.category}</span>
            </Card>
          ))}</Stagger>
        </div>
      )}</QueryBoundary>
    </FadeSlideIn>
  );
}
