import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { day: "월", latency: 420 },
  { day: "화", latency: 390 },
  { day: "수", latency: 360 },
  { day: "목", latency: 310 },
  { day: "금", latency: 280 },
  { day: "토", latency: 260 }
];

export default function ChartAreaLinearExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>선형 영역형 차트</strong>
        <span>평균 응답 시간이 안정되는 흐름</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="day" stroke="#a1a1aa" />
          <YAxis stroke="#a1a1aa" />
          <Tooltip contentStyle={{ background: "#111113", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa" }} />
          <Area dataKey="latency" name="응답 시간(ms)" stroke="#fafafa" fill="#fafafa24" type="linear" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
