import { useState } from "react";

const logs = [
  { level: "info", text: "build started" },
  { level: "warn", text: "slow dependency install" },
  { level: "error", text: "route smoke failed" },
  { level: "info", text: "artifact uploaded" }
];

export default function JobLogLevelFilterExample() {
  const [level, setLevel] = useState("all");
  const visible = level === "all" ? logs : logs.filter((log) => log.level === level);

  return (
    <div className="log-filter-card">
      <div className="segmented-row">
        {["all", "info", "warn", "error"].map((item) => (
          <button className={level === item ? "active" : ""} key={item} onClick={() => setLevel(item)}>
            {item}
          </button>
        ))}
      </div>
      <pre className="terminal-log">
        {visible.map((log) => (
          <code key={`${log.level}-${log.text}`}>[{log.level}] {log.text}</code>
        ))}
      </pre>
    </div>
  );
}
