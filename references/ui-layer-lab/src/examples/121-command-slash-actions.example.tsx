import { Command } from "cmdk";
import { useState } from "react";

const commands = ["/explain", "/fix", "/test", "/summarize"];

export default function CommandSlashActionsExample() {
  const [value, setValue] = useState("/");
  const [picked, setPicked] = useState("/explain");

  return (
    <div className="command-filter-demo">
      <Command shouldFilter={false} className="command-dialog inline-command">
        <Command.Input value={value} onValueChange={setValue} placeholder="Type / for actions..." />
        <Command.List>
          <Command.Group heading="Slash actions">
            {commands
              .filter((command) => command.includes(value))
              .map((command) => (
                <Command.Item key={command} onSelect={() => setPicked(command)}>
                  <span>{command}</span>
                  <kbd>AI</kbd>
                </Command.Item>
              ))}
          </Command.Group>
        </Command.List>
      </Command>
      <span className="muted">Selected {picked}</span>
    </div>
  );
}
