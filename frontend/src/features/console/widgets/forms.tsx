// 위젯 폼 렌더러 — 6종 (스탯/게이지/라인/바/도넛/테이블)
// 라이브 원칙(I2): 색·숫자만 부드럽게 움직인다. 레이아웃은 흔들지 않는다.
// 결측 원칙(I11): nodata는 회색 카드 + 사유. 값을 지어내지 않는다.
import { Chip } from '@/plural-ui';
import { useLiveValue } from '../live';
import { ScopeMap } from '../map/ScopeMap';
import { METRIC_META, type WidgetConfig, type WidgetData, type WidgetScope } from './types';

const DEFAULT_THRESHOLDS = { warn: 65, danger: 85 };

function fmt(value: number, unit: string): string {
  if (unit === '$') return `$${value >= 1000 ? Math.round(value).toLocaleString() : value.toFixed(0)}`;
  if (unit === '%') return `${value.toFixed(1)}%`;
  return `${Math.round(value).toLocaleString()}${unit}`;
}

function severityColor(value: number, thresholds = DEFAULT_THRESHOLDS): string {
  if (value >= thresholds.danger) return 'var(--color-text-danger)';
  if (value >= thresholds.warn) return 'var(--color-text-warning)';
  return 'var(--color-text-success)';
}

/* ── 스탯 ─────────────────────────────
 * 스탯 텍스트는 라이브로 흔들지 않는다 — 숫자 폭이 바뀌면 카드가 덜컹거린다.
 * 라이브 연출은 SVG 내부에서만 움직이는 게이지가 담당 (레이아웃 불변 원칙 I2). */
function StatForm({ config, data }: { config: WidgetConfig; data: Extract<WidgetData, { kind: 'scalar' }> }) {
  const isPct = data.unit === '%';
  const value = data.value;
  const meta = METRIC_META[config.query.metric];
  const alertStyle = config.query.metric === 'alert_count' && value > 0;
  return (
    <div className="wb-stat">
      <span
        className="wb-stat-value"
        style={isPct ? { color: severityColor(value, config.thresholds) } : alertStyle ? { color: 'var(--color-text-danger)' } : undefined}
      >
        {fmt(value, data.unit)}
      </span>
      <div className="pl-row" style={{ gap: 6 }}>
        {data.deltaPct !== undefined && (
          <Chip severity={data.deltaPct > 0 ? 'danger' : 'success'}>
            {data.deltaPct > 0 ? '▲' : '▼'} {Math.abs(data.deltaPct).toFixed(1)}%
          </Chip>
        )}
        {meta.kind === 'usd' && <span className="pl-muted">/월</span>}
      </div>
    </div>
  );
}

/* ── 게이지 (반원) ────────────────────── */
function GaugeForm({ config, data }: { config: WidgetConfig; data: Extract<WidgetData, { kind: 'scalar' }> }) {
  // 게이지는 SVG viewBox 안에서만 움직여 레이아웃을 밀지 않는다 → 라이브 허용
  const lived = useLiveValue(data.value, 1.6, { min: 0, max: 100 });
  const pct = Math.max(0, Math.min(100, data.live ? lived : data.value));
  const R = 44;
  const C = Math.PI * R; // 반원 둘레
  const color = severityColor(pct, config.thresholds);
  return (
    <div className="wb-gauge">
      <svg viewBox="0 0 110 62" width="110" height="62">
        <path d={`M 11 55 A ${R} ${R} 0 0 1 99 55`} fill="none" stroke="var(--color-fill-two)" strokeWidth="9" strokeLinecap="round" />
        <path
          d={`M 11 55 A ${R} ${R} 0 0 1 99 55`}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * C} ${C}`}
          // rAF가 이미 부드럽게 움직인다 — CSS 트랜지션을 겹치면 프레임이 밀려 버벅인다
          style={{ transition: 'stroke 0.4s ease' }}
        />
        <text x="55" y="52" textAnchor="middle" fontSize="17" fontWeight="600" fill="var(--color-text)" fontFamily="var(--font-semi)">
          {pct.toFixed(1)}%
        </text>
      </svg>
    </div>
  );
}

/* ── 라인 ─────────────────────────────── */
function LineForm({ data }: { data: Extract<WidgetData, { kind: 'series' }> }) {
  const { points, unit } = data;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const W = 100;
  const H = 40;
  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${((i / (points.length - 1)) * W).toFixed(2)} ${(H - ((v - min) / range) * (H - 4) - 2).toFixed(2)}`)
    .join(' ');
  return (
    <div className="wb-line">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="wb-line-svg">
        <path d={`${d} L ${W} ${H} L 0 ${H} Z`} fill="var(--color-border-selected, #4a51e0)" opacity="0.12" stroke="none" />
        <path d={d} fill="none" stroke="var(--color-border-selected, #7075f0)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="wb-line-meta">
        <span className="pl-muted">{fmt(min, unit)} ~ {fmt(max, unit)}</span>
        <span style={{ fontWeight: 600 }}>{fmt(data.value, unit)}</span>
      </div>
    </div>
  );
}

/* ── 바 (수평) ────────────────────────── */
function BarForm({ data }: { data: Extract<WidgetData, { kind: 'rows' }> }) {
  const max = Math.max(...data.rows.map((r) => r.value), 1);
  return (
    <div className="wb-bars">
      {data.rows.map((r) => (
        <div key={r.name} className="wb-bar-row" title={`${r.name}: ${fmt(r.value, data.unit)}`}>
          <span className="wb-bar-name">{r.name}</span>
          <div className="wb-bar-track">
            <div className="wb-bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="wb-bar-value">{fmt(r.value, data.unit)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── 도넛 ─────────────────────────────── */
const DONUT_COLORS = [
  'var(--color-text-success)',
  'var(--color-border-selected, #7075f0)',
  'var(--color-text-warning)',
  'var(--color-text-danger)',
  'var(--color-text-xlight)',
];

function DonutForm({ data }: { data: Extract<WidgetData, { kind: 'rows' }> }) {
  const top = data.rows.slice(0, 4);
  const rest = data.rows.slice(4).reduce((s, r) => s + r.value, 0);
  const segs = rest > 0 ? [...top, { name: '기타', value: rest }] : top;
  const total = segs.reduce((s, r) => s + r.value, 0) || 1;
  const R = 26;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="wb-donut">
      <svg viewBox="0 0 64 64" width="64" height="64">
        {segs.map((s, i) => {
          const len = (s.value / total) * C;
          const el = (
            <circle
              key={s.name}
              cx="32"
              cy="32"
              r={R}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="8"
              strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${C - Math.max(len - 1.5, 0.5)}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 32 32)"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="wb-donut-legend">
        {segs.map((s, i) => (
          <div key={s.name} className="wb-legend-row" title={fmt(s.value, data.unit)}>
            <span className="dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="name">{s.name}</span>
            <span className="pl-muted">{((s.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 테이블 (순위) ────────────────────── */
function TableForm({ data }: { data: Extract<WidgetData, { kind: 'rows' }> }) {
  const total = data.rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <div className="wb-table">
      {data.rows.map((r, i) => (
        <div key={r.name} className="wb-table-row">
          <span className="rank">{i + 1}</span>
          <span className="name">{r.name}</span>
          <span className="share pl-muted">{((r.value / total) * 100).toFixed(0)}%</span>
          <span className="value">{fmt(r.value, data.unit)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── 결측 (I11) ───────────────────────── */
function NoData({ reason }: { reason: string }) {
  return (
    <div className="wb-nodata">
      <span className="wb-nodata-title">데이터 없음</span>
      <span className="pl-muted">{reason}</span>
    </div>
  );
}

/* ── 디스패처 ─────────────────────────── */
export function WidgetBody({
  config,
  data,
  scope,
}: {
  config: WidgetConfig;
  data: WidgetData;
  scope: WidgetScope;
}) {
  // 맵 폼: 쿼리 없이 스코프 자체가 데이터 — 드릴다운 탐색 레이어 (I9)
  if (config.form === 'map') return <ScopeMap scope={scope} />;
  if (data.kind === 'nodata') return <NoData reason={data.reason} />;
  switch (config.form) {
    case 'stat':
      return data.kind === 'scalar' ? <StatForm config={config} data={data} /> : <NoData reason="스칼라 데이터가 필요해요" />;
    case 'gauge':
      return data.kind === 'scalar' ? <GaugeForm config={config} data={data} /> : <NoData reason="스칼라 데이터가 필요해요" />;
    case 'line':
      return data.kind === 'series' ? <LineForm data={data} /> : <NoData reason="시계열 데이터가 필요해요" />;
    case 'bar':
      return data.kind === 'rows' ? <BarForm data={data} /> : <NoData reason="그룹 데이터가 필요해요" />;
    case 'donut':
      return data.kind === 'rows' ? <DonutForm data={data} /> : <NoData reason="그룹 데이터가 필요해요" />;
    case 'table':
      return data.kind === 'rows' ? <TableForm data={data} /> : <NoData reason="그룹 데이터가 필요해요" />;
  }
}
