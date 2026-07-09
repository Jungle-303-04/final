import { Command } from "cmdk";
import { useState } from "react";

const lines = ["L18 install", "L42 build", "L87 visual smoke", "L104 upload"];

export default function CommandLogJumpToLineExample() {
  const [line, setLine] = useState("L42 build");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Jump to log line..." />
        <Command.List>
          <Command.Group heading="Log lines">
            {lines.map((item) => <Command.Item key={item} onSelect={() => setLine(item)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <pre className="terminal-log"><code>Selected {line}</code></pre>
    </div>
  );
}
