import { useState } from "react";

const lines = ["checkout ok", "install ok", "typecheck ok", "build ok", "visual-smoke running", "upload pending"];

export default function JobLogWindowFollowExample() {
  const [offset, setOffset] = useState(0);
  const visible = lines.slice(offset, offset + 3);

  return (
    <div className="log-window-card">
      <button className="command-trigger" onClick={() => setOffset((value) => (value + 1) % 4)}>Follow Tail</button>
      <pre className="terminal-log">
        {visible.map((line) => <code key={line}>{line}</code>)}
      </pre>
    </div>
  );
}
