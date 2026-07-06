// L1 클러스터 맵 — 그룹핑 토글(서비스별/노드별/네임스페이스별, I1: 한 번에 하나)
// 셀 클릭 → L2 페이지 (클러스터 내 서비스 / 노드 / 네임스페이스 상세)
// URL이 진실 (I10): ?group=…&lens=…
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/plural-ui';
import { collectorOf, getNamespaceAggs, getNodeAggs, getServiceAggs, type GroupAgg } from '../api';
import { cpuColor, dangerCell, fmtCost, memColor, shareColor } from './colors';
import { labelMode, layoutTreemap } from './treemap';
import './map.css';

type Group = 'service' | 'node' | 'namespace';
type Lens = 'cpu' | 'mem' | 'cost';

const GROUP_META: Record<Group, string> = { service: '서비스별', node: '노드별', namespace: '네임스페이스별' };
const LENS_LABEL: Record<Lens, string> = { cpu: 'CPU', mem: '메모리', cost: '비용' };

export function ClusterMap({ clusterId }: { clusterId: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const group = (['service', 'node', 'namespace'].includes(params.get('group') ?? '') ? params.get('group') : 'service') as Group;
  const lens = (['cpu', 'mem', 'cost'].includes(params.get('lens') ?? '') ? params.get('lens') : 'cpu') as Lens;
  const setParam = (k: 'group' | 'lens', v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

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
  const HEIGHT = 320;

  const collector = collectorOf(clusterId);

  const cells = useMemo(() => {
    if (!collector.healthy) return [];
    if (group === 'node') {
      return getNodeAggs(clusterId).map((n) => {
        const short = n.name.split('.')[0];
        const cpuPct = (n.cpuUse / n.cpuCap) * 100;
        const memPct = (n.memUse / n.memCap) * 100;
        const size = lens === 'cpu' ? n.cpuReq : lens === 'mem' ? n.memReq : n.costMonth;
        const value = lens === 'cpu' ? `${cpuPct.toFixed(0)}%` : lens === 'mem' ? `${memPct.toFixed(0)}%` : fmtCost(n.costMonth);
        const color = !n.ready
          ? dangerCell
          : lens === 'cpu'
            ? cpuColor(cpuPct)
            : lens === 'mem'
              ? memColor(memPct)
              : shareColor(n.costMonth / getNodeAggs(clusterId).reduce((s, x) => s + x.costMonth, 0));
        return {
          id: n.name,
          name: short,
          size,
          color,
          value: n.ready ? value : 'NotReady',
          dim: false,
          title: `${short} — CPU ${cpuPct.toFixed(1)}% · MEM ${memPct.toFixed(1)}% · 팟 ${n.podCount}개${n.ready ? '' : ' · NotReady'}`,
          to: `/console/cd/clusters/${clusterId}/nodes/${encodeURIComponent(n.name)}`,
        };
      });
    }
    const groups: GroupAgg[] = group === 'service' ? getServiceAggs(clusterId) : getNamespaceAggs(clusterId);
    const totalCost = groups.reduce((s, g) => s + g.costMonth, 0) || 1;
    return groups.map((g) => {
      const cpuPct = g.cpuReq > 0 ? (g.cpuUse / g.cpuReq) * 100 : 0;
      const memPct = g.memReq > 0 ? (g.memUse / g.memReq) * 100 : 0;
      const size = lens === 'cpu' ? g.cpuReq : lens === 'mem' ? g.memReq : g.costMonth;
      const value = lens === 'cpu' ? `${cpuPct.toFixed(0)}%` : lens === 'mem' ? `${memPct.toFixed(0)}%` : fmtCost(g.costMonth);
      return {
        id: g.name,
        name: g.name,
        size,
        color: lens === 'cost' ? shareColor(g.costMonth / totalCost) : lens === 'cpu' ? cpuColor(cpuPct) : memColor(memPct),
        value,
        dim: false,
        title: `${g.name} — 팟 ${g.podCount}개 · CPU(요청 대비) ${cpuPct.toFixed(1)}% · MEM ${memPct.toFixed(1)}% · ${fmtCost(g.costMonth)}/월`,
        to:
          group === 'service'
            ? `/console/cd/clusters/${clusterId}/services/${encodeURIComponent(g.name)}`
            : `/console/cd/clusters/${clusterId}/namespaces/${encodeURIComponent(g.name)}`,
      };
    });
  }, [clusterId, group, lens, collector.healthy]);

  const rects = useMemo(() => layoutTreemap(cells, width || 1, HEIGHT), [cells, width]);

  if (!collector.healthy) {
    // I11: 값을 지어내지 않는다 — 맵 대신 복구 안내
    return (
      <section className="co-map">
        <div className="co-map-head">
          <span className="co-map-title">클러스터 맵</span>
        </div>
        <div className="co-map-canvas co-map-empty" style={{ height: 160 }}>
          <span style={{ fontWeight: 600 }}>데이터 없음</span>
          <span className="pl-muted">{collector.reason}</span>
          <Button size="small" onClick={() => navigate(`/console/cd/clusters/${clusterId}/addons`)}>
            애드온에서 확인
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="co-map">
      <div className="co-map-head">
        <div className="pl-row">
          <span className="co-map-title">클러스터 맵</span>
          <div className="pl-segment">
            {(Object.keys(GROUP_META) as Group[]).map((g) => (
              <button key={g} type="button" className={group === g ? 'on' : ''} onClick={() => setParam('group', g)}>
                {GROUP_META[g]}
              </button>
            ))}
          </div>
          <div className="pl-segment">
            {(Object.keys(LENS_LABEL) as Lens[]).map((l) => (
              <button key={l} type="button" className={lens === l ? 'on' : ''} onClick={() => setParam('lens', l)}>
                {LENS_LABEL[l]}
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
                className="co-mapcell"
                title={cell.title}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: cell.color }}
                onClick={() => navigate(cell.to)}
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
    </section>
  );
}
