import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { day: "월", chat: 24, tool: 10 },
  { day: "화", chat: 30, tool: 14 },
  { day: "수", chat: 28, tool: 18 },
  { day: "목", chat: 36, tool: 22 },
  { day: "금", chat: 42, tool: 19 }
];

export default function ChartAreaLegendExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>범례가 있는 영역형 차트</strong>
        <span>대화 요청과 도구 실행을 함께 비교</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="day" stroke="#a1a1aa" />
          <YAxis stroke="#a1a1aa" />
          <Tooltip contentStyle={{ background: "#111113", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa" }} />
          <Legend />
          <Area dataKey="chat" name="대화" stroke="#93c5fd" fill="#93c5fd30" isAnimationActive={false} />
          <Area dataKey="tool" name="도구 실행" stroke="#86efac" fill="#86efac2b" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
