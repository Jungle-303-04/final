import { Command } from "cmdk";
import { useState } from "react";

const modes = ["Move", "Select", "Execute"];

export default function CommandKeyboardModeSwitchExample() {
  const [mode, setMode] = useState("Move");

  return (
    <div className="command-filter-demo">
      <strong>Keyboard mode: {mode}</strong>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Switch keyboard mode..." />
        <Command.List>
          <Command.Group heading="Modes">
            {modes.map((item) => (
              <Command.Item key={item} onSelect={() => setMode(item)}>
                <span>{item}</span>
                <kbd>{item === mode ? "on" : "set"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
