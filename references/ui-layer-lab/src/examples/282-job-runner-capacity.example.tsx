import { useState } from "react";

export default function JobRunnerCapacityExample() {
  const [used, setUsed] = useState(5);

  return (
    <div className="resource-meter">
      <section>
        <strong>Runners</strong>
        <div className="progress-track"><div style={{ width: `${used * 10}%` }} /></div>
        <span>{used}/10</span>
      </section>
      <button className="command-trigger" onClick={() => setUsed((value) => (value >= 10 ? 3 : value + 1))}>Schedule Job</button>
    </div>
  );
}
