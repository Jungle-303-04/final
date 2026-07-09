import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartBlue, chartGreen, chartGridStroke, chartMutedStroke, chartRed, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { day: "월", ui: 20, api: 10, infra: 5 },
  { day: "화", ui: 16, api: 15, infra: 7 },
  { day: "수", ui: 18, api: 19, infra: 8 },
  { day: "목", ui: 14, api: 22, infra: 12 },
  { day: "금", ui: 21, api: 18, infra: 10 }
];

export default function ChartAreaStackedExpandExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>비율 누적 영역형 차트</strong>
        <span>영역 전체를 100%로 맞춰 소유 영역 비중을 확인</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data} stackOffset="expand">
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="day" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area dataKey="ui" name="UI" stackId="1" stroke={chartBlue} fill={chartBlue} fillOpacity={0.24} isAnimationActive={false} />
          <Area dataKey="api" name="API" stackId="1" stroke={chartGreen} fill={chartGreen} fillOpacity={0.22} isAnimationActive={false} />
          <Area dataKey="infra" name="인프라" stackId="1" stroke={chartRed} fill={chartRed} fillOpacity={0.22} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
