import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartGreen, chartGridStroke, chartMutedStroke, chartRed, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { day: "월", success: 12, failed: 2 },
  { day: "화", success: 18, failed: 3 },
  { day: "수", success: 15, failed: 5 },
  { day: "목", success: 22, failed: 1 },
  { day: "금", success: 26, failed: 4 }
];

export default function ChartAreaDeploymentTrendExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>배포 성공 추세</strong>
        <span>영역형 차트로 성공/실패 흐름 비교</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="success-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={chartGreen} stopOpacity={0.45} />
              <stop offset="95%" stopColor={chartGreen} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="day" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area dataKey="success" name="성공" stroke={chartGreen} fill="url(#success-fill)" isAnimationActive={false} />
          <Area dataKey="failed" name="실패" stroke={chartRed} fill={chartRed} fillOpacity={0.18} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
