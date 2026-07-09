import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { day: "월", build: 12, test: 9, deploy: 4 },
  { day: "화", build: 16, test: 12, deploy: 5 },
  { day: "수", build: 15, test: 14, deploy: 7 },
  { day: "목", build: 20, test: 16, deploy: 8 },
  { day: "금", build: 18, test: 13, deploy: 6 }
];

export default function ChartAreaStackedExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>누적 영역형 차트</strong>
        <span>빌드, 테스트, 배포 작업량을 하나의 면적으로 합산</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="day" stroke="#a1a1aa" />
          <YAxis stroke="#a1a1aa" />
          <Tooltip contentStyle={{ background: "#111113", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa" }} />
          <Area dataKey="build" name="빌드" stackId="1" stroke="#93c5fd" fill="#93c5fd40" isAnimationActive={false} />
          <Area dataKey="test" name="테스트" stackId="1" stroke="#86efac" fill="#86efac38" isAnimationActive={false} />
          <Area dataKey="deploy" name="배포" stackId="1" stroke="#fdba74" fill="#fdba7438" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
