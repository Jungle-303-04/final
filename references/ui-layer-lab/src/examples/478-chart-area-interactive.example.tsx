import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartBlue, chartGridStroke, chartMutedStroke, chartRed, chartTooltipStyle } from "./shared/chartTheme";

const allData = [
  { day: "월", requests: 220, errors: 8 },
  { day: "화", requests: 260, errors: 11 },
  { day: "수", requests: 240, errors: 13 },
  { day: "목", requests: 310, errors: 9 },
  { day: "금", requests: 340, errors: 12 },
  { day: "토", requests: 210, errors: 6 },
  { day: "일", requests: 190, errors: 5 }
];

export default function ChartAreaInteractiveExample() {
  const [metric, setMetric] = useState<"requests" | "errors">("requests");
  const total = useMemo(() => allData.reduce((sum, item) => sum + item[metric], 0), [metric]);

  return (
    <section className="chart-card">
      <header className="chart-header-row">
        <div>
          <strong>인터랙티브 영역형 차트</strong>
          <span>버튼으로 지표를 바꿔 같은 공간에서 비교</span>
        </div>
        <div className="chart-button-row" aria-label="차트 지표 선택">
          <button className={metric === "requests" ? "active" : ""} onClick={() => setMetric("requests")}>
            요청
          </button>
          <button className={metric === "errors" ? "active" : ""} onClick={() => setMetric("errors")}>
            오류
          </button>
        </div>
      </header>
      <div className="chart-kpi-row">
        <span>선택 합계</span>
        <strong>{total.toLocaleString("ko-KR")}</strong>
      </div>
      <ResponsiveContainer height={250} width="100%">
        <AreaChart data={allData}>
          <CartesianGrid stroke={chartGridStroke} vertical={false} />
          <XAxis dataKey="day" stroke={chartMutedStroke} />
          <YAxis stroke={chartMutedStroke} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area dataKey={metric} name={metric === "requests" ? "요청" : "오류"} stroke={metric === "requests" ? chartBlue : chartRed} fill={metric === "requests" ? chartBlue : chartRed} fillOpacity={0.2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
