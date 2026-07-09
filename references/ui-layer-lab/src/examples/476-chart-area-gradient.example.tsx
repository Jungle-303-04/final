import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { day: "월", success: 68 },
  { day: "화", success: 72 },
  { day: "수", success: 76 },
  { day: "목", success: 83 },
  { day: "금", success: 88 },
  { day: "토", success: 91 }
];

export default function ChartAreaGradientExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>그라디언트 영역형 차트</strong>
        <span>성공률이 높아지는 방향을 부드러운 면으로 강조</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="success-rate-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#86efac" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#86efac" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="day" stroke="#a1a1aa" />
          <YAxis stroke="#a1a1aa" domain={[60, 100]} tickFormatter={(value) => `${value}%`} />
          <Tooltip contentStyle={{ background: "#111113", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa" }} />
          <Area dataKey="success" name="성공률" stroke="#86efac" fill="url(#success-rate-gradient)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
