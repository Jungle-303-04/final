import { useState } from "react";

const commands = ["npm run typecheck", "npm run build", "npm run smoke"];

export default function JobTerminalRunnerExample() {
  const [line, setLine] = useState(commands[0]);

  return (
    <div className="live-tail">
      <pre className="terminal-log">
        <code>$ {line}</code>
        <code>status: ready</code>
      </pre>
      <div className="segmented-row">
        {commands.map((command) => <button key={command} onClick={() => setLine(command)}>{command}</button>)}
      </div>
    </div>
  );
}
