import { Command } from "cmdk";

const shortcuts = [
  ["Open command", "⌘K"],
  ["Open logs", "⌘L"],
  ["Toggle AI", "⌘I"],
  ["Focus jobs", "G J"]
];

export default function CommandShortcutCheatsheetExample() {
  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="Search shortcuts..." />
      <Command.List>
        <Command.Group heading="Keyboard">
          {shortcuts.map(([label, keys]) => (
            <Command.Item key={label}>
              <span>{label}</span>
              <kbd>{keys}</kbd>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
