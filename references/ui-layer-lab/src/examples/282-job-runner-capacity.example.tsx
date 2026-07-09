import { useState } from "react";

export default function JobRunnerCapacityExample() {
  const [used, setUsed] = useState(5);

  return (
    <div className="resource-meter">
      <section>
        <strong>러너 사용량</strong>
        <div className="progress-track"><div style={{ width: `${used * 10}%` }} /></div>
        <span aria-live="polite">{used}/10 사용 중</span>
      </section>
      <button className="command-trigger stable-wide" onClick={() => setUsed((value) => (value >= 10 ? 3 : value + 1))} type="button">
        작업 예약
      </button>
    </div>
  );
}
