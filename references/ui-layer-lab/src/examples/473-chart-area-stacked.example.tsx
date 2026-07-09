import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartBlue, chartGreen, chartGridStroke, chartMutedStroke, chartOrange, chartTooltipStyle } from "./shared/chartTheme";

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
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="day" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area dataKey="build" name="빌드" stackId="1" stroke={chartBlue} fill={chartBlue} fillOpacity={0.24} isAnimationActive={false} />
          <Area dataKey="test" name="테스트" stackId="1" stroke={chartGreen} fill={chartGreen} fillOpacity={0.22} isAnimationActive={false} />
          <Area dataKey="deploy" name="배포" stackId="1" stroke={chartOrange} fill={chartOrange} fillOpacity={0.22} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
