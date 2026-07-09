import { useState } from "react";

const logs = ["install complete", "typecheck complete", "visual smoke failed"];

export default function AnimatedCollapsibleLogExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="collapsible-log">
      <button className="command-trigger" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide" : "Show"} Logs
      </button>
      {open ? (
        <pre className="terminal-log">
          {logs.map((line) => (
            <code key={line}>{line}</code>
          ))}
        </pre>
      ) : null}
    </div>
  );
}
