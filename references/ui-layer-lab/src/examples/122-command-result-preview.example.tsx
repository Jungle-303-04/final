import { Command } from "cmdk";
import { useState } from "react";

const results = [
  { name: "workflow.yaml", type: "file", preview: "Runs install, typecheck, build, and smoke." },
  { name: "deploy-preview", type: "run", preview: "Failed in visual-smoke after route lookup." },
  { name: "target.md", type: "doc", preview: "Target registration and scheduling profile spec." }
];

export default function CommandResultPreviewExample() {
  const [selected, setSelected] = useState(results[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Search everything..." />
        <Command.List>
          <Command.Group heading="Results">
            {results.map((item) => (
              <Command.Item key={item.name} onSelect={() => setSelected(item)}>
                <span>{item.name}</span>
                <kbd>{item.type}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{selected.name}</strong>
        <span>{selected.preview}</span>
      </aside>
    </div>
  );
}
