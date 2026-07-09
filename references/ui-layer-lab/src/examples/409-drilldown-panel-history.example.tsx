import { useState } from "react";

const history = ["workflow", "job", "step", "log"];

export default function DrilldownPanelHistoryExample() {
  const [depth, setDepth] = useState(1);

  return (
    <div className="breadcrumb-drill">
      <nav>
        {history.slice(0, depth + 1).map((item, index) => (
          <button key={item} onClick={() => setDepth(index)}>{item}</button>
        ))}
      </nav>
      <div className="animated-tab-panel">
        <strong>{history[depth]}</strong>
        <span>History can jump back to any parent panel</span>
      </div>
      <button className="command-trigger" onClick={() => setDepth((value) => Math.min(history.length - 1, value + 1))}>Drill Down</button>
    </div>
  );
}
