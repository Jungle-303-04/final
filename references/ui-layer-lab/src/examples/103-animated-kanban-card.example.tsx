import { useState } from "react";

const lanes = ["Queued", "Running", "Review"];

export default function AnimatedKanbanCardExample() {
  const [lane, setLane] = useState(0);

  return (
    <div className="kanban-motion">
      <div className="segmented-row">
        {lanes.map((item, index) => (
          <button className={lane === index ? "active" : ""} key={item} onClick={() => setLane(index)}>
            {item}
          </button>
        ))}
      </div>
      <div className="kanban-board">
        {lanes.map((item, index) => (
          <section key={item}>
            <strong>{item}</strong>
            {lane === index ? <article className="moving-card">visual smoke</article> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
