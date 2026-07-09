import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartGridStroke, chartMutedStroke, chartRed, chartTextStroke, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { time: "09시", latency: 180 },
  { time: "10시", latency: 220 },
  { time: "11시", latency: 340 },
  { time: "12시", latency: 260 },
  { time: "13시", latency: 410 }
];

export default function ChartLineLatencySlaExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>응답 지연 SLA</strong>
        <span>기준선을 넘는 구간을 빠르게 확인</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <LineChart data={data}>
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="time" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <ReferenceLine y={300} stroke={chartRed} strokeDasharray="5 5" />
          <Line dataKey="latency" name="지연 시간" stroke={chartTextStroke} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
