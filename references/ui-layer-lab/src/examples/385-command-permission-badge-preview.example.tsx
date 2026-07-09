import { Command } from "cmdk";
import { useState } from "react";

const actions = [
  { name: "Open logs", allowed: true },
  { name: "Restart runner", allowed: false },
  { name: "Download artifact", allowed: true }
];

export default function CommandPermissionBadgePreviewExample() {
  const [action, setAction] = useState(actions[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Run protected action..." />
        <Command.List>
          <Command.Group heading="Actions">
            {actions.map((item) => (
              <Command.Item disabled={!item.allowed} key={item.name} onSelect={() => setAction(item)} value={item.name}>
                {item.name}
                <span>{item.allowed ? "Allowed" : "Admin"}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{action.name}</strong>
        <span>{action.allowed ? "Ready to run" : "Requires admin"}</span>
      </aside>
    </div>
  );
}
