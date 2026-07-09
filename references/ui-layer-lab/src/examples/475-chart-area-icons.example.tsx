import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartGridStroke, chartMutedStroke, chartTextStroke, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { channel: "AI", count: 42 },
  { channel: "Git", count: 35 },
  { channel: "로그", count: 28 },
  { channel: "배포", count: 18 },
  { channel: "알림", count: 24 }
];

export default function ChartAreaIconsExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>아이콘 라벨 영역형 차트</strong>
        <span>축 라벨을 짧은 서비스 채널명처럼 읽기 쉽게 축약</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="channel" stroke={chartMutedStroke} tickLine={false} />
          <YAxis stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area dataKey="count" name="이벤트" stroke={chartTextStroke} fill={chartTextStroke} fillOpacity={0.14} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span>AI: 대화</span>
        <span>Git: 동기화</span>
        <span>로그: 추적</span>
      </div>
    </section>
  );
}
