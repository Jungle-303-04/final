import { Command } from "cmdk";
import { useState } from "react";

const shortcuts = [
  { name: "Open command", keys: "Cmd K", conflict: "none" },
  { name: "Run AI edit", keys: "Cmd J", conflict: "browser downloads" },
  { name: "Toggle job tray", keys: "Cmd Shift J", conflict: "devtools" }
];

export default function CommandHotkeyConflictsExample() {
  const [selected, setSelected] = useState(shortcuts[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Search shortcuts..." />
        <Command.List>
          <Command.Group heading="Shortcuts">
            {shortcuts.map((item) => (
              <Command.Item key={item.name} onSelect={() => setSelected(item)}>
                <span>{item.name}</span>
                <kbd>{item.keys}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{selected.keys}</strong>
        <span>Conflict: {selected.conflict}</span>
      </aside>
    </div>
  );
}
