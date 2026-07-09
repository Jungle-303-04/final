import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

const data = [
  { time: "09:00", requests: 18 },
  { time: "10:00", requests: 30 },
  { time: "11:00", requests: 26 },
  { time: "12:00", requests: 38 },
  { time: "13:00", requests: 44 },
  { time: "14:00", requests: 35 }
];

export default function ChartAreaDefaultExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>기본 영역형 차트</strong>
        <span>AI 요청량의 시간대별 흐름</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="time" stroke="#a1a1aa" />
          <Tooltip contentStyle={{ background: "#111113", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa" }} />
          <Area dataKey="requests" name="요청" stroke="#93c5fd" fill="#93c5fd33" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
