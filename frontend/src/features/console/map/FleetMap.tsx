// L0 플릿 히트맵 — 마켓맵 문법의 탐색 레이어 (기획서 §1)
// 원칙:
//  - 크기 = 규모(팟 수·비용, 느린 값) / 색 = 상태(건강·사용률·증감, 상태 값) — I2
//  - 렌즈는 URL(?lens=)이 진실 — I10
//  - 셀 = 뷰어에게 보이는 클러스터만, 집계도 같은 분모 — I6
//  - 수집기 비정상 셀은 회색 "데이터 없음" + 클릭 시 복구 안내 — I11
//  - 셀이 작으면 라벨 단계 생략(이름+값 → 값 → 없음) + 툴팁 — §1.4
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Modal } from '@/plural-ui';
import { useVisibleClusters } from '../viewer';
import { collectorOf, getClusterAgg } from '../api';
import type { ConsoleCluster } from '../api';
import { labelMode, layoutTreemap } from './treemap';
import './map.css';

type Lens = 'all' | 'cpu' | 'mem' | 'cost';

const LENS_META: Record<Lens, { label: string }> = {
  all: { label: '전체' },
  cpu: { label: 'CPU' },
  mem: { label: '메모리' },
  cost: { label: '비용' },
};

import { cpuColor, deltaColor, fmtCost, healthColor, memColor } from './colors';

type MapCellData = {
  id: string;
  name: string;
  size: number;
  color: string;
  value: string;
  dim: boolean;
  title: string;
};

export function FleetMap() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const lens = (['all', 'cpu', 'mem', 'cost'].includes(params.get('lens') ?? '') ? params.get('lens') : 'all') as Lens;
  const setLens = (l: Lens) => setParams(l === 'all' ? {} : { lens: l }, { replace: true });

  const { clusters } = useVisibleClusters(); // I6
  const [collectorFor, setCollectorFor] = useState<ConsoleCluster | null>(null);

  // 컨테이너 폭 측정 (레이아웃은 렌즈/데이터 변경 시에만 재계산)
  const canvasRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const HEIGHT = 340;

  const cells = useMemo<MapCellData[]>(() => {
    const aggs = clusters.map((c) => ({ c, agg: getClusterAgg(c.id) }));
    const okCosts = aggs.filter((x) => x.agg.available).map((x) => x.agg.costMonth).sort((a, b) => a - b);
    const medianCost = okCosts.length > 0 ? okCosts[Math.floor(okCosts.length / 2)] : 1;

    return aggs.map(({ c, agg }) => {
      if (!agg.available) {
        const collector = collectorOf(c.id);
        return {
          id: c.id,
          name: c.name,
          // 규모: 팟 수는 등록 정보(수집기와 무관)라 사용 가능. 비용 렌즈에선 중앙값으로 탐색만 유지
          size: lens === 'cost' ? medianCost : c.pods,
          color: 'var(--color-fill-two)',
          value: '—',
          dim: true,
          title: `${c.name} — 데이터 없음: ${collector.reason ?? '수집기 비정상'}`,
        };
      }
      const base = { id: c.id, name: c.name, dim: false };
      switch (lens) {
        case 'all':
          return { ...base, size: c.pods, color: healthColor(c.health), value: String(c.health), title: `${c.name} — 건강 ${c.health} · 팟 ${c.pods}개` };
        case 'cpu':
          return { ...base, size: c.pods, color: cpuColor(agg.cpuUsePct), value: `${agg.cpuUsePct.toFixed(1)}%`, title: `${c.name} — CPU ${agg.cpuUsePct.toFixed(1)}% (${(agg.cpuUse / 1000).toFixed(0)}/${(agg.cpuCap / 1000).toFixed(0)} 코어)` };
        case 'mem':
          return { ...base, size: c.pods, color: memColor(agg.memUsePct), value: `${agg.memUsePct.toFixed(1)}%`, title: `${c.name} — 메모리 ${agg.memUsePct.toFixed(1)}% (${(agg.memUse / 1024).toFixed(0)}/${(agg.memCap / 1024).toFixed(0)} Gi)` };
        case 'cost':
          return { ...base, size: agg.costMonth, color: deltaColor(agg.costDeltaPct), value: `${fmtCost(agg.costMonth)} (${agg.costDeltaPct > 0 ? '+' : ''}${agg.costDeltaPct.toFixed(1)}%)`, title: `${c.name} — ${fmtCost(agg.costMonth)}/월 · 전주 대비 ${agg.costDeltaPct > 0 ? '+' : ''}${agg.costDeltaPct.toFixed(1)}%` };
      }
    });
  }, [clusters, lens]);

  const rects = useMemo(() => layoutTreemap(cells, width || 1, HEIGHT), [cells, width]);

  return (
    <section className="co-map">
      <div className="co-map-head">
        <div className="pl-row">
          <span className="co-map-title">플릿 맵</span>
          <div className="pl-segment">
            {(Object.keys(LENS_META) as Lens[]).map((l) => (
              <button key={l} type="button" className={lens === l ? 'on' : ''} onClick={() => setLens(l)}>
                {LENS_META[l].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={canvasRef} className="co-map-canvas" style={{ height: HEIGHT }}>
        {width > 0 &&
          cells.map((cell) => {
            const r = rects.get(cell.id);
            if (!r) return null;
            const mode = labelMode(r.w, r.h);
            return (
              <button
                key={cell.id}
                type="button"
                className={`co-mapcell${cell.dim ? ' dim' : ''}`}
                title={cell.title}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: cell.color }}
                onClick={() => {
                  if (cell.dim) {
                    const c = clusters.find((x) => x.id === cell.id);
                    if (c) setCollectorFor(c);
                  } else navigate(`/console/cd/clusters/${cell.id}`);
                }}
              >
                {mode === 'full' && (
                  <>
                    <span className="name">{cell.name}</span>
                    <span className="value">{cell.value}</span>
                  </>
                )}
                {mode === 'value' && <span className="value">{cell.value}</span>}
              </button>
            );
          })}
      </div>

      {/* I11: 수집기 비정상 셀 클릭 → 복구 안내 */}
      {collectorFor && (
        <Modal
          open
          onClose={() => setCollectorFor(null)}
          title={`메트릭 없음 — ${collectorFor.name}`}
          actions={
            <>
              <Button onClick={() => setCollectorFor(null)}>닫기</Button>
              <Button
                variant="primary"
                onClick={() => navigate(`/console/cd/clusters/${collectorFor.id}/addons`)}
              >
                애드온에서 확인
              </Button>
            </>
          }
        >
          <div className="pl-stack" style={{ gap: 8 }}>
            <p style={{ margin: 0 }}>{collectorOf(collectorFor.id).reason}</p>
            <p className="pl-muted" style={{ margin: 0 }}>
              메트릭은 각 노드의 node-collector가 수집해요. 수집기가 없거나 비정상이면 이 클러스터의
              사용률·비용을 계산할 수 없어 집계에서 제외됩니다 — 값을 추정하지 않아요.
            </p>
          </div>
        </Modal>
      )}
    </section>
  );
}
