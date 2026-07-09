import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { chartBlue, chartGridStroke, chartMutedStroke, chartTooltipStyle } from "./shared/chartTheme";

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
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="time" stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area dataKey="requests" name="요청" stroke={chartBlue} fill={chartBlue} fillOpacity={0.2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
