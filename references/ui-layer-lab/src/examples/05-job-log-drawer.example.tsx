import { useState } from "react";
const logs = [
  "remote: Enumerating objects: 18",
  "receiving objects: 100%",
  "resolving deltas: 73%",
  "checking workspace conflicts"
];

export default function JobLogDrawerExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="example-stack">
      <button className="job-row" onClick={() => setOpen(true)}>
        <span>git pull origin dev</span>
        <strong>64%</strong>
      </button>

      {open ? (
        <aside className="floating-drawer">
          <div className="drawer-header">
            <strong>git pull origin dev</strong>
            <button onClick={() => setOpen(false)} type="button">닫기</button>
          </div>
          <pre className="terminal-log">
            {logs.map((line) => (
              <code key={line}>{line}</code>
            ))}
          </pre>
        </aside>
      ) : null}
    </div>
  );
}
