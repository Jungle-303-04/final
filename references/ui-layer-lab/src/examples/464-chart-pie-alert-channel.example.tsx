import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { chartBlue, chartGreen, chartOrange, chartTooltipStyle } from "./shared/chartTheme";

const data = [
  { name: "토스트", value: 42, color: chartBlue },
  { name: "작업 센터", value: 31, color: chartGreen },
  { name: "무음 로그", value: 18, color: chartOrange }
];

export default function ChartPieAlertChannelExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>알림 채널 비중</strong>
        <span>사용자가 어디서 상태를 인지하는지 확인</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <PieChart>
          <Tooltip contentStyle={chartTooltipStyle} />
          <Pie data={data} dataKey="value" innerRadius={58} outerRadius={95} paddingAngle={4} isAnimationActive={false}>
            {data.map((entry) => <Cell fill={entry.color} key={entry.name} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="chart-legend">{data.map((item) => <span key={item.name}>{item.name} {item.value}%</span>)}</div>
    </section>
  );
}
