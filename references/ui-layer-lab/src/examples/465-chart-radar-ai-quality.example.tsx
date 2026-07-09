import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { chartBlue, chartGridStroke, chartMutedStroke, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { axis: "정확도", score: 86 },
  { axis: "근거", score: 72 },
  { axis: "속도", score: 91 },
  { axis: "안전성", score: 78 },
  { axis: "실행력", score: 83 }
];

export default function ChartRadarAiQualityExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>AI 응답 품질</strong>
        <span>평가 축을 레이더 차트로 비교</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <RadarChart data={data}>
          <PolarGrid stroke={chartGridStroke} />
          <PolarAngleAxis dataKey="axis" stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Radar dataKey="score" name="점수" stroke={chartBlue} fill={chartBlue} fillOpacity={0.28} isAnimationActive={false} />
        </RadarChart>
      </ResponsiveContainer>
    </section>
  );
}
