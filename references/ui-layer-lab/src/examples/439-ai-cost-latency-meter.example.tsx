import { useState } from "react";

const samples = [
  { cost: "$0.04", latency: 32 },
  { cost: "$0.09", latency: 68 },
  { cost: "$0.13", latency: 86 }
];

export default function AiCostLatencyMeterExample() {
  const [index, setIndex] = useState(0);
  const sample = samples[index];

  return (
    <div className="resource-meter">
      <section>
        <strong>{sample.cost}</strong>
        <div className="progress-track"><div style={{ width: `${sample.latency}%` }} /></div>
        <span>{sample.latency}ms</span>
      </section>
      <button className="command-trigger stable-wide" onClick={() => setIndex((value) => (value + 1) % samples.length)} type="button">다음 샘플</button>
    </div>
  );
}
