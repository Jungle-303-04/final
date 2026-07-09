import { Command } from "cmdk";
import { useState } from "react";

const actions = [
  { name: "Open failed run", scope: "workflow", score: 96 },
  { name: "Explain selected diff", scope: "ai", score: 88 },
  { name: "Retry flaky shard", scope: "job", score: 74 }
];

export default function CommandRankedActionsExample() {
  const [active, setActive] = useState(actions[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Ranked actions..." />
        <Command.List>
          <Command.Group heading="Best matches">
            {actions.map((action) => (
              <Command.Item key={action.name} onSelect={() => setActive(action)}>
                <span>{action.name}</span>
                <kbd>{action.score}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{active.name}</strong>
        <span>{active.scope} match score</span>
        <div className="progress-track"><div style={{ width: `${active.score}%` }} /></div>
      </aside>
    </div>
  );
}
