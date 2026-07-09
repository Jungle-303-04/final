import { useState } from "react";

const modes = {
  Plan: ["Inspect current state", "Choose smallest patch", "Ask before destructive action"],
  Execute: ["Apply patch", "Run typecheck", "Capture result"]
};

export default function AiPlanExecuteSwitchExample() {
  const [mode, setMode] = useState<keyof typeof modes>("Plan");

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {Object.keys(modes).map((item) => <button className={mode === item ? "active" : ""} key={item} onClick={() => setMode(item as keyof typeof modes)}>{item}</button>)}
      </div>
      <div className="animated-tab-panel">
        <strong>{mode} mode</strong>
        {modes[mode].map((item) => <span key={item}>{item}</span>)}
      </div>
    </div>
  );
}
