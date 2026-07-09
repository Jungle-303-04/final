import { Command } from "cmdk";
import { useState } from "react";

const workspaces = ["frontend", "agents", "infra"];

export default function CommandWorkspaceSwitcherExample() {
  const [workspace, setWorkspace] = useState("frontend");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Switch workspace..." />
        <Command.List>
          <Command.Group heading="Workspaces">
            {workspaces.map((item) => <Command.Item key={item} onSelect={() => setWorkspace(item)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{workspace}</strong>
        <span>Workspace context active</span>
      </aside>
    </div>
  );
}
