import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { chartMutedStroke, chartTextStroke, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { day: "월", value: 12 },
  { day: "화", value: 18 },
  { day: "수", value: 11 },
  { day: "목", value: 24 },
  { day: "금", value: 20 }
];

export default function ChartDashboardCardExample() {
  return (
    <section className="chart-card dashboard-chart-card">
      <header>
        <span>이번 주 처리량</span>
        <strong>85건</strong>
      </header>
      <ResponsiveContainer height={180} width="100%">
        <BarChart data={data}>
          <XAxis dataKey="day" stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Bar dataKey="value" name="처리량" fill={chartTextStroke} radius={[8, 8, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
