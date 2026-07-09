import { useState } from "react";

const runs = [
  { id: "A", status: "success", duration: "1m 20s", commit: "a12f" },
  { id: "B", status: "failed", duration: "1m 45s", commit: "b91c" }
];

export default function DrilldownCompareExample() {
  const [left, setLeft] = useState(runs[0]);
  const [right, setRight] = useState(runs[1]);

  return (
    <div className="compare-panel">
      {[left, right].map((run, index) => (
        <section key={index}>
          <select value={run.id} onChange={(event) => (index === 0 ? setLeft : setRight)(runs.find((item) => item.id === event.target.value) ?? run)}>
            {runs.map((item) => (
              <option key={item.id}>{item.id}</option>
            ))}
          </select>
          <strong>Run {run.id}</strong>
          <span>{run.status}</span>
          <span>{run.duration}</span>
          <span>{run.commit}</span>
        </section>
      ))}
    </div>
  );
}
