import { useState } from "react";

const tests = ["visual-smoke", "auth-flow", "billing-webhook"];

export default function JobFlakyDetectorExample() {
  const [selected, setSelected] = useState("visual-smoke");

  return (
    <div className="metric-bars">
      {tests.map((test, index) => (
        <button className={selected === test ? "active" : ""} key={test} onClick={() => setSelected(test)}>
          <strong>{test}</strong>
          <div className="progress-track"><div style={{ width: `${35 + index * 24}%` }} /></div>
        </button>
      ))}
    </div>
  );
}
