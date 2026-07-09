import { useState } from "react";

export default function JobCacheMeterExample() {
  const [hitRate, setHitRate] = useState(64);

  return (
    <div className="resource-meter">
      <section>
        <strong>캐시 적중률</strong>
        <div className="progress-track"><div style={{ width: `${hitRate}%` }} /></div>
        <span aria-live="polite">{hitRate}%</span>
      </section>
      <button className="command-trigger stable-wide" onClick={() => setHitRate((value) => (value >= 90 ? 42 : value + 14))} type="button">
        새로고침
      </button>
    </div>
  );
}
