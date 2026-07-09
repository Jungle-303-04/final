import { useState } from "react";

const runs = [
  { name: "미리보기", status: "failed", label: "실패" },
  { name: "API", status: "running", label: "실행 중" },
  { name: "워커", status: "success", label: "성공" }
];

const statusLabels = {
  all: "전체",
  failed: "실패",
  running: "실행 중",
  success: "성공"
};

export default function DrilldownStatusFiltersExample() {
  const [status, setStatus] = useState<keyof typeof statusLabels>("all");
  const filtered = status === "all" ? runs : runs.filter((run) => run.status === status);

  return (
    <div className="drill-grid">
      <div className="drawer">
        <div className="segmented-row">
          {Object.entries(statusLabels).map(([key, label]) => (
            <button className={status === key ? "active" : ""} key={key} onClick={() => setStatus(key as keyof typeof statusLabels)} type="button">
              {label}
            </button>
          ))}
        </div>
        {filtered.map((run) => (
          <button className="row-button" key={run.name} type="button">
            {run.name} · {run.label}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>실행 {filtered.length}개</strong>
        <span>{statusLabels[status]} 상태만 표시합니다.</span>
      </aside>
    </div>
  );
}
