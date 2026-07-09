import { useState } from "react";

const lanes = [
  { id: "queued", label: "대기" },
  { id: "running", label: "실행 중" },
  { id: "review", label: "검토" }
];

export default function AnimatedKanbanCardExample() {
  const [lane, setLane] = useState(0);

  return (
    <div className="kanban-motion">
      <div className="segmented-row">
        {lanes.map((item, index) => (
          <button className={lane === index ? "active" : ""} key={item.id} onClick={() => setLane(index)} type="button">
            {item.label}
          </button>
        ))}
      </div>
      <div className="kanban-board">
        {lanes.map((item, index) => (
          <section key={item.id}>
            <strong>{item.label}</strong>
            {lane === index ? <article className="moving-card">시각 점검</article> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
