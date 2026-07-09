import { Command } from "cmdk";
import { useState } from "react";

const actions = ["Open workflow logs", "Retry failed job", "Ask AI about this page", "Create deployment note"];

export default function CommandRecentActionsExample() {
  const [recent, setRecent] = useState(["Open workflow logs", "Ask AI about this page"]);

  function run(action: string) {
    setRecent((items) => [action, ...items.filter((item) => item !== action)].slice(0, 3));
  }

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="Search action..." />
      <Command.List>
        <Command.Group heading="Recent">
          {recent.map((action) => (
            <Command.Item key={action} onSelect={() => run(action)}>
              <span>{action}</span>
              <kbd>recent</kbd>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="All actions">
          {actions.map((action) => (
            <Command.Item key={action} onSelect={() => run(action)}>
              {action}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
