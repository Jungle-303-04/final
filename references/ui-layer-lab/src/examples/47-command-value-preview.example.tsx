import { Command } from "cmdk";
import { useState } from "react";

const actions = [
  { id: "ask-ai", name: "Ask AI", scope: "Overlay", detail: "Open the assistant on top of the current page." },
  { id: "pull", name: "Git Pull", scope: "Job", detail: "Fetch and rebase the active branch." },
  { id: "logs", name: "Open Logs", scope: "Drilldown", detail: "Jump into the latest workflow log." }
];

export default function CommandValuePreviewExample() {
  const [value, setValue] = useState(actions[0].id);
  const selected = actions.find((action) => action.id === value) ?? actions[0];

  return (
    <div className="inline-command-layout">
      <Command value={value} onValueChange={setValue} className="command-dialog inline-command">
        <Command.Input placeholder="Search action..." />
        <Command.List>
          <Command.Group heading="Actions">
            {actions.map((action) => (
              <Command.Item key={action.id} value={action.id} onSelect={() => setValue(action.id)}>
                <span>{action.name}</span>
                <kbd>{action.scope}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>

      <aside className="detail-panel">
        <strong>{selected.name}</strong>
        <span>{selected.scope}</span>
        <p>{selected.detail}</p>
      </aside>
    </div>
  );
}
