import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { channel: "AI", count: 42 },
  { channel: "Git", count: 35 },
  { channel: "로그", count: 28 },
  { channel: "배포", count: 18 },
  { channel: "알림", count: 24 }
];

export default function ChartAreaIconsExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>아이콘 라벨 영역형 차트</strong>
        <span>축 라벨을 짧은 서비스 채널명처럼 읽기 쉽게 축약</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="channel" stroke="#a1a1aa" tickLine={false} />
          <YAxis stroke="#a1a1aa" />
          <Tooltip contentStyle={{ background: "#111113", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa" }} />
          <Area dataKey="count" name="이벤트" stroke="#fafafa" fill="#fafafa24" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span>AI: 대화</span>
        <span>Git: 동기화</span>
        <span>로그: 추적</span>
      </div>
    </section>
  );
}
