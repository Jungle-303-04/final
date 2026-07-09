import { useState } from "react";

const segments = [25, 50, 75, 100];

export default function AnimatedProgressSegmentFillExample() {
  const [index, setIndex] = useState(0);
  const value = segments[index];

  return (
    <div className="resource-meter">
      <section>
        <strong>{value}%</strong>
        <div className="progress-track"><div style={{ width: `${value}%` }} /></div>
        <span>Segment</span>
      </section>
      <button className="command-trigger" onClick={() => setIndex((current) => (current + 1) % segments.length)}>
        Fill Next
      </button>
    </div>
  );
}
