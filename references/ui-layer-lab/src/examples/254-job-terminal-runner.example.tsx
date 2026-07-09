import { useState } from "react";

const commands = [
  { label: "타입 검사", value: "npm run typecheck" },
  { label: "빌드", value: "npm run build" },
  { label: "스모크 검사", value: "npm run smoke" }
];

export default function JobTerminalRunnerExample() {
  const [line, setLine] = useState(commands[0]);

  return (
    <div className="live-tail">
      <pre className="terminal-log">
        <code>$ {line.value}</code>
        <code>상태: 대기 중</code>
      </pre>
      <div className="segmented-row">
        {commands.map((command) => (
          <button aria-pressed={line.value === command.value} className={line.value === command.value ? "active stable-wide" : "stable-wide"} key={command.value} onClick={() => setLine(command)} type="button">
            {command.label}
          </button>
        ))}
      </div>
    </div>
  );
}
