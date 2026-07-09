import { Command } from "cmdk";
import { useState } from "react";

const runs = Array.from({ length: 12 }, (_, index) => `run-${index + 31}`);

export default function CommandScrollIndexPreviewExample() {
  const [run, setRun] = useState(runs[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Search recent runs..." />
        <Command.List className="command-scroll-list">
          <Command.Group heading="Recent runs">
            {runs.map((item, index) => (
              <Command.Item key={item} onSelect={() => setRun(item)} value={item}>
                {item}
                <kbd>{index + 1}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{run}</strong>
        <span>Opened from scroll list</span>
      </aside>
    </div>
  );
}
