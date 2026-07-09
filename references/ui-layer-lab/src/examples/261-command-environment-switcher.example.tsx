import { Command } from "cmdk";
import { useState } from "react";

const environments = ["local", "preview", "staging", "production"];

export default function CommandEnvironmentSwitcherExample() {
  const [environment, setEnvironment] = useState("preview");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Switch environment..." />
        <Command.List>
          <Command.Group heading="Environments">
            {environments.map((item) => (
              <Command.Item key={item} onSelect={() => setEnvironment(item)}>
                <span>{item}</span>
                <kbd>{item === environment ? "on" : "go"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{environment}</strong>
        <span>Active context: {environment}</span>
      </aside>
    </div>
  );
}
