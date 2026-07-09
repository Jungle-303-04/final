import { useState } from "react";

const metrics = [
  { name: "API", value: 82, detail: "배포 후 지연 시간이 증가했습니다." },
  { name: "웹", value: 43, detail: "라우트 검사가 안정적으로 통과했습니다." },
  { name: "워커", value: 67, detail: "큐가 천천히 비워지고 있습니다." }
];

export default function DrilldownMetricBreakdownExample() {
  const [selected, setSelected] = useState(metrics[0]);

  return (
    <div className="table-drill">
      <div className="metric-bars">
        {metrics.map((metric) => (
          <button className={metric.name === selected.name ? "active" : ""} key={metric.name} onClick={() => setSelected(metric)} type="button">
            <span>{metric.name}</span>
            <div className="progress-track">
              <div style={{ width: `${metric.value}%` }} />
            </div>
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{selected.name}</strong>
        <span>{selected.detail}</span>
      </aside>
    </div>
  );
}
