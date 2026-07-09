import { useState } from "react";

const frames = ["App", "JobPanel", "LogDrawer", "AnsiLine"];

export default function DrilldownErrorBoundaryTreeExample() {
  const [frame, setFrame] = useState(frames[1]);

  return (
    <div className="tree-panel">
      {frames.map((item) => (
        <button className={frame === item ? "tree-row active" : "tree-row"} key={item} onClick={() => setFrame(item)}>
          {item}
        </button>
      ))}
      <div className="animated-tab-panel">
        <strong>{frame}</strong>
        <span>Selected stack frame detail</span>
      </div>
    </div>
  );
}
