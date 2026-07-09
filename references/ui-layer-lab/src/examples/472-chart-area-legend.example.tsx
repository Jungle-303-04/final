import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartBlue, chartGreen, chartGridStroke, chartMutedStroke, chartTooltipStyle } from "./shared/chartTheme";

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
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="day" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Legend />
          <Area dataKey="chat" name="대화" stroke={chartBlue} fill={chartBlue} fillOpacity={0.18} isAnimationActive={false} />
          <Area dataKey="tool" name="도구 실행" stroke={chartGreen} fill={chartGreen} fillOpacity={0.16} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
