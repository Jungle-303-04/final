import { useState } from "react";

export default function JobCacheMeterExample() {
  const [hitRate, setHitRate] = useState(64);

  return (
    <div className="resource-meter">
      <section>
        <strong>Cache</strong>
        <div className="progress-track"><div style={{ width: `${hitRate}%` }} /></div>
        <span>{hitRate}%</span>
      </section>
      <button className="command-trigger" onClick={() => setHitRate((value) => (value >= 90 ? 42 : value + 14))}>Refresh</button>
    </div>
  );
}
