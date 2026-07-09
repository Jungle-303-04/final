import { Command } from "cmdk";
import { useState } from "react";

const actions = [
  { name: "Open AI overlay", keys: "Cmd J" },
  { name: "Focus job tray", keys: "Cmd Shift P" },
  { name: "Toggle logs", keys: "Cmd L" }
];

export default function CommandShortcutPreviewCardExample() {
  const [action, setAction] = useState(actions[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Preview shortcut..." />
        <Command.List>
          <Command.Group heading="Actions">
            {actions.map((item) => <Command.Item key={item.name} onSelect={() => setAction(item)}>{item.name}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{action.name}</strong>
        <kbd>{action.keys}</kbd>
      </aside>
    </div>
  );
}
