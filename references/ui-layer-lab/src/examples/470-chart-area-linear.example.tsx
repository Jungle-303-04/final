import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartGridStroke, chartMutedStroke, chartTextStroke, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { day: "월", latency: 420 },
  { day: "화", latency: 390 },
  { day: "수", latency: 360 },
  { day: "목", latency: 310 },
  { day: "금", latency: 280 },
  { day: "토", latency: 260 }
];

export default function ChartAreaLinearExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>선형 영역형 차트</strong>
        <span>평균 응답 시간이 안정되는 흐름</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="day" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area dataKey="latency" name="응답 시간(ms)" stroke={chartTextStroke} fill={chartTextStroke} fillOpacity={0.14} type="linear" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
