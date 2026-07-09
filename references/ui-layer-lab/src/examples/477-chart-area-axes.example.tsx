import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartBlue, chartGridStroke, chartMutedStroke, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { minute: "0분", tokens: 1200 },
  { minute: "5분", tokens: 2300 },
  { minute: "10분", tokens: 3100 },
  { minute: "15분", tokens: 2800 },
  { minute: "20분", tokens: 3600 },
  { minute: "25분", tokens: 4200 }
];

export default function ChartAreaAxesExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>축이 있는 영역형 차트</strong>
        <span>Y축 단위와 X축 구간을 명확히 보여주는 형태</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data} margin={{ left: 8, right: 18 }}>
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="minute" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} tickFormatter={(value) => `${Number(value) / 1000}k`} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area dataKey="tokens" name="토큰" stroke={chartBlue} fill={chartBlue} fillOpacity={0.2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
