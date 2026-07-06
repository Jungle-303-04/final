// L2 팟맵 — 서비스/노드/네임스페이스 상세 페이지의 팟 히트맵 (리프 직전 레벨)
// 셀 클릭 → 팟 상세 페이지. CrashLoop 팟은 강한 위험색으로 표시 (시나리오 정합)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { PodMetric } from '../api';
import { cpuColor, dangerCell, fmtCost, memColor, shareColor } from './colors';
import { labelMode, layoutTreemap } from './treemap';
import './map.css';

type Lens = 'cpu' | 'mem' | 'cost';
const LENS_LABEL: Record<Lens, string> = { cpu: 'CPU', mem: '메모리', cost: '비용' };

export function PodMap({ clusterId, pods }: { clusterId: string; pods: PodMetric[] }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const lens = (['cpu', 'mem', 'cost'].includes(params.get('lens') ?? '') ? params.get('lens') : 'mem') as Lens;
  const setLens = (l: Lens) => {
    const next = new URLSearchParams(params);
    next.set('lens', l);
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
  const HEIGHT = pods.length > 60 ? 360 : 240;

  const cells = useMemo(() => {
    const totalCost = pods.reduce((s, p) => s + p.costMonth, 0) || 1;
    return pods.map((p) => {
      const cpuPct = (p.cpuUse / p.cpuReq) * 100;
      const memPct = (p.memUse / p.memReq) * 100;
      const bad = p.status !== '실행 중';
      const size = lens === 'cpu' ? p.cpuReq : lens === 'mem' ? p.memReq : p.costMonth;
      const value = lens === 'cpu' ? `${cpuPct.toFixed(0)}%` : lens === 'mem' ? `${memPct.toFixed(0)}%` : fmtCost(p.costMonth);
      return {
        id: p.name,
        name: p.name,
        size,
        color: bad
          ? dangerCell
          : lens === 'cost'
            ? shareColor(p.costMonth / totalCost)
            : lens === 'cpu'
              ? cpuColor(cpuPct)
              : memColor(memPct),
        value: bad ? p.status : value,
        title: `${p.name} — ${p.status} · CPU ${cpuPct.toFixed(0)}% · MEM ${memPct.toFixed(0)}% (${p.memUse}/${p.memReq}Mi) · 재시작 ${p.restarts}회`,
        bad,
      };
    });
  }, [pods, lens]);

  const rects = useMemo(() => layoutTreemap(cells, width || 1, HEIGHT), [cells, width]);

  return (
    <section className="co-map">
      <div className="co-map-head">
        <div className="pl-row">
          <span className="co-map-title">팟맵</span>
          <div className="pl-segment">
            {(Object.keys(LENS_LABEL) as Lens[]).map((l) => (
              <button key={l} type="button" className={lens === l ? 'on' : ''} onClick={() => setLens(l)}>
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
                className={`co-mapcell${cell.bad ? ' bad' : ''}`}
                title={cell.title}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: cell.color }}
                onClick={() => navigate(`/console/cd/clusters/${clusterId}/pods/${encodeURIComponent(cell.name)}`)}
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
