import type { Accent, MetricPoint } from '../types';

const accentMap: Record<Accent, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#8b5cf6',
  amber: '#f59e0b',
  slate: '#94a3b8',
  rose: '#fb7185',
};

function pointsToPath(points: MetricPoint[], width: number, height: number) {
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value), 0);
  const range = Math.max(max - min, 1);
  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function AreaSparkline({
  points,
  accent = 'blue',
  height = 112,
}: {
  points: MetricPoint[];
  accent?: Accent;
  height?: number;
}) {
  const width = 300;
  const pad = 8;
  const linePath = pointsToPath(points, width - pad * 2, height - pad * 2);
  const shiftedLine = linePath.replace(/([ML]) ([\d.-]+) ([\d.-]+)/g, (_, command, x, y) => {
    return `${command} ${(Number(x) + pad).toFixed(2)} ${(Number(y) + pad).toFixed(2)}`;
  });
  const areaPath = `${shiftedLine} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`;
  const color = accentMap[accent];

  return (
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="latency trend">
      <defs>
        <linearGradient id={`area-${accent}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.42" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#area-${accent})`} />
      <path d={shiftedLine} fill="none" stroke={color} strokeWidth="3" />
      {points.map((point, index) => {
        const max = Math.max(...points.map((item) => item.value), 1);
        const min = Math.min(...points.map((item) => item.value), 0);
        const range = Math.max(max - min, 1);
        const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
        const y = pad + (height - pad * 2 - ((point.value - min) / range) * (height - pad * 2));
        return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="2.6" fill="#0b0b0d" stroke={color} strokeWidth="1.6" />;
      })}
    </svg>
  );
}

export function DonutGauge({
  value,
  accent = 'green',
  label,
}: {
  value: number;
  accent?: Accent;
  label: string;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dash = (safeValue / 100) * circumference;
  const color = accentMap[accent];

  return (
    <div className="gauge">
      <svg viewBox="0 0 100 100" className="gauge-svg" role="img" aria-label={label}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#23252b" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="gauge-center">
        <strong>{safeValue}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function BarStack({ points }: { points: MetricPoint[] }) {
  const total = points.reduce((sum, point) => sum + point.value, 0) || 1;

  return (
    <div className="bar-stack">
      <div className="stack-track">
        {points.map((point, index) => (
          <span
            key={point.label}
            className={`stack-segment stack-${index + 1}`}
            style={{ width: `${(point.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="stack-labels">
        {points.map((point, index) => (
          <span key={point.label}>
            <i className={`legend-dot legend-${index + 1}`} />
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SaturationBars({ points }: { points: MetricPoint[] }) {
  return (
    <div className="saturation-bars">
      {points.map((point, index) => (
        <div className="saturation-row" key={point.label}>
          <span>{point.label}</span>
          <div className="saturation-track">
            <i className={`saturation-fill fill-${index + 1}`} style={{ width: `${point.value}%` }} />
          </div>
          <strong>{point.value}%</strong>
        </div>
      ))}
    </div>
  );
}
