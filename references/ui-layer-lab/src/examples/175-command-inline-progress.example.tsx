import { Command } from "cmdk";
import { useState } from "react";

export default function CommandInlineProgressExample() {
  const [running, setRunning] = useState(false);

  function start() {
    setRunning(true);
    window.setTimeout(() => setRunning(false), 1400);
  }

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="Choose a job command..." />
      <Command.List>
        <Command.Group heading="Jobs">
          <Command.Item onSelect={start}>
            <span>Pull latest changes</span>
            <span className={running ? "inline-loader active" : "inline-loader"}>{running ? "Running" : "Ready"}</span>
          </Command.Item>
          <Command.Item>
            <span>Open workflow logs</span>
            <kbd>⌘L</kbd>
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
