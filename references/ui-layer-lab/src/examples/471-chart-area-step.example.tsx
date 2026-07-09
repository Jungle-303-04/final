import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartGridStroke, chartMutedStroke, chartOrange, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { stage: "대기", count: 8 },
  { stage: "가져오기", count: 8 },
  { stage: "테스트", count: 5 },
  { stage: "빌드", count: 5 },
  { stage: "배포", count: 2 },
  { stage: "완료", count: 0 }
];

export default function ChartAreaStepExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>스텝 영역형 차트</strong>
        <span>파이프라인 단계가 넘어갈 때 남은 작업 수</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="stage" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area dataKey="count" name="남은 작업" stroke={chartOrange} fill={chartOrange} fillOpacity={0.18} type="step" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
