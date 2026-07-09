import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartBlue, chartGridStroke, chartMutedStroke, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { name: "대기", count: 8 },
  { name: "실행 중", count: 13 },
  { name: "성공", count: 29 },
  { name: "실패", count: 5 }
];

export default function ChartBarRunStatusExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>실행 상태 분포</strong>
        <span>작업 큐 상태를 막대 차트로 요약</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <BarChart data={data}>
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="name" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Bar dataKey="count" name="개수" fill={chartBlue} radius={[8, 8, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
