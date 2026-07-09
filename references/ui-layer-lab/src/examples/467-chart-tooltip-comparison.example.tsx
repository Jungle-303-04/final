import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartBlue, chartGridStroke, chartMutedStroke, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { day: "월", current: 24, previous: 19 },
  { day: "화", current: 31, previous: 27 },
  { day: "수", current: 28, previous: 33 },
  { day: "목", current: 39, previous: 29 },
  { day: "금", current: 35, previous: 30 }
];

export default function ChartTooltipComparisonExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>기간 비교 툴팁</strong>
        <span>현재 기간과 이전 기간을 같은 축에서 비교</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="day" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area dataKey="previous" name="이전" stroke={chartMutedStroke} fill={chartMutedStroke} fillOpacity={0.18} isAnimationActive={false} />
          <Area dataKey="current" name="현재" stroke={chartBlue} fill={chartBlue} fillOpacity={0.2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
