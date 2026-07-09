import { Command } from "cmdk";
import { useState } from "react";

const records = [
  { id: "run-411", title: "Deploy preview", owner: "Mina", status: "failed" },
  { id: "run-412", title: "Unit tests", owner: "Joon", status: "passed" },
  { id: "run-413", title: "Visual smoke", owner: "Ara", status: "running" }
];

export default function CommandObjectSearchExample() {
  const [selected, setSelected] = useState(records[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Search structured records..." />
        <Command.List>
          <Command.Group heading="Runs">
            {records.map((record) => (
              <Command.Item key={record.id} onSelect={() => setSelected(record)}>
                <span>{record.title}</span>
                <kbd>{record.status}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{selected.id}</strong>
        <span>{selected.title}</span>
        <span>Owner: {selected.owner}</span>
        <span>Status: {selected.status}</span>
      </aside>
    </div>
  );
}
