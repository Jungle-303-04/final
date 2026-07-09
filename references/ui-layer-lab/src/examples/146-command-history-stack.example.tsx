import { Command } from "cmdk";
import { useState } from "react";

const actions = ["Open logs", "Explain failure", "Create patch", "Rerun job"];

export default function CommandHistoryStackExample() {
  const [history, setHistory] = useState(["Open logs"]);

  function run(action: string) {
    setHistory((items) => [action, ...items].slice(0, 5));
  }

  return (
    <div className="command-filter-demo">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Run an action..." />
        <Command.List>
          <Command.Group heading="Actions">
            {actions.map((action) => (
              <Command.Item key={action} onSelect={() => run(action)}>
                {action}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <div className="history-stack">
        {history.map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </div>
  );
}
