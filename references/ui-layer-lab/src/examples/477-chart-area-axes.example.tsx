import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { minute: "0분", tokens: 1200 },
  { minute: "5분", tokens: 2300 },
  { minute: "10분", tokens: 3100 },
  { minute: "15분", tokens: 2800 },
  { minute: "20분", tokens: 3600 },
  { minute: "25분", tokens: 4200 }
];

export default function ChartAreaAxesExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>축이 있는 영역형 차트</strong>
        <span>Y축 단위와 X축 구간을 명확히 보여주는 형태</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data} margin={{ left: 8, right: 18 }}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="minute" stroke="#a1a1aa" />
          <YAxis stroke="#a1a1aa" tickFormatter={(value) => `${Number(value) / 1000}k`} />
          <Tooltip contentStyle={{ background: "#111113", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa" }} />
          <Area dataKey="tokens" name="토큰" stroke="#93c5fd" fill="#93c5fd33" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
