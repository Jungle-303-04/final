// 스코프 → 맵 디스패처 — "맵" 위젯 폼의 본체 (기획서 I9: 스코프가 곧 쿼리)
// fleet → 클러스터 셀 / cluster → 그룹 셀 / service·node → 팟 셀
// 드릴다운: 셀 클릭이 다음 레벨 "페이지"로 이동하고, 그 페이지의 보드에 다시 맵 위젯이 있다.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/plural-ui';
import type { WidgetScope } from '../widgets/types';
import { collectorOf, getPodMetrics } from '../api';
import { FleetMap } from './FleetMap';
import { ClusterMap } from './ClusterMap';
import { PodMap } from './PodMap';

function CollectorEmpty({ clusterId }: { clusterId: string }) {
  const navigate = useNavigate();
  const collector = collectorOf(clusterId);
  return (
    <div className="co-map-canvas co-map-empty" style={{ height: 160, width: '100%' }}>
      <span style={{ fontWeight: 600 }}>데이터 없음</span>
      <span className="pl-muted">{collector.reason}</span>
      <Button size="small" onClick={() => navigate(`/console/cd/clusters/${clusterId}/addons`)}>
        애드온에서 확인
      </Button>
    </div>
  );
}

export function ScopeMap({ scope }: { scope: WidgetScope }) {
  const pods = useMemo(() => {
    if (scope.level === 'service')
      return getPodMetrics(scope.clusterId).filter((p) => p.service === scope.service);
    if (scope.level === 'node')
      return getPodMetrics(scope.clusterId).filter((p) => p.nodeName === scope.node);
    return [];
  }, [scope]);

  switch (scope.level) {
    case 'fleet':
      return <FleetMap />;
    case 'cluster':
      return <ClusterMap clusterId={scope.clusterId} />;
    case 'service':
    case 'node':
      if (!collectorOf(scope.clusterId).healthy) return <CollectorEmpty clusterId={scope.clusterId} />;
      return <PodMap clusterId={scope.clusterId} pods={pods} />;
  }
}
