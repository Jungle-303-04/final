import { Command } from "cmdk";
import { useState } from "react";

const actions = ["Ask AI", "Open Logs", "Run Tests", "Push Branch"];

export default function CommandPinnedActionsExample() {
  const [pinned, setPinned] = useState(["Ask AI"]);

  function toggle(action: string) {
    setPinned((items) => (items.includes(action) ? items.filter((item) => item !== action) : [...items, action]));
  }

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="Pin important actions..." />
      <Command.List>
        <Command.Group heading="Pinned">
          {pinned.map((action) => (
            <Command.Item key={action} onSelect={() => toggle(action)}>
              <span>{action}</span>
              <kbd>pinned</kbd>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="All">
          {actions.map((action) => (
            <Command.Item key={action} onSelect={() => toggle(action)}>
              <span>{action}</span>
              <kbd>{pinned.includes(action) ? "unpin" : "pin"}</kbd>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
