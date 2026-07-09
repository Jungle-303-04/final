import { useState } from "react";

const frames = [
  { file: "smoke.spec.ts", line: 41, detail: "Expected /preview to load." },
  { file: "router.tsx", line: 18, detail: "Route no longer registered." },
  { file: "App.tsx", line: 7, detail: "Routes rendered from config." }
];

export default function DrilldownErrorStackExample() {
  const [frame, setFrame] = useState(frames[0]);

  return (
    <div className="table-drill">
      <div className="stack-list">
        {frames.map((item) => (
          <button className={item.file === frame.file ? "active" : ""} key={item.file} onClick={() => setFrame(item)}>
            {item.file}:{item.line}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{frame.file}</strong>
        <span>line {frame.line}</span>
        <span>{frame.detail}</span>
      </aside>
    </div>
  );
}
