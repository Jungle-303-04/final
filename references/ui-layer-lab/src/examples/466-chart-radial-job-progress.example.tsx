import { RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { chartGreen } from "./shared/chartTheme";

const data = [{ name: "진행률", value: 72, fill: chartGreen }];

export default function ChartRadialJobProgressExample() {
  return (
    <section className="chart-card compact-chart">
      <header>
        <strong>작업 진행률</strong>
        <span>작업 센터에서 쓰기 좋은 방사형 진행 상태</span>
      </header>
      <ResponsiveContainer height={260} width="100%">
        <RadialBarChart data={data} endAngle={-270} innerRadius={86} outerRadius={118} startAngle={90}>
          <RadialBar background dataKey="value" cornerRadius={18} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <strong className="chart-center-label">72%</strong>
    </section>
  );
}
