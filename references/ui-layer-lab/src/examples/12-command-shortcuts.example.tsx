import { Command } from "cmdk";
import { useEffect, useState } from "react";

const actions = [
  ["Open profile", "⌘P"],
  ["Open billing", "⌘B"],
  ["Open settings", "⌘S"],
  ["Create repository", "⌘N"]
];

export default function CommandShortcutsExample() {
  const [open, setOpen] = useState(false);
  const [lastAction, setLastAction] = useState("Nothing selected");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function run(action: string) {
    setLastAction(action);
    setOpen(false);
  }

  return (
    <div className="command-demo">
      <div className="result-panel">
        <strong>Selected action</strong>
        <span>{lastAction}</span>
        <button className="command-trigger" onClick={() => setOpen(true)}>
          Open menu
        </button>
      </div>

      {open ? (
        <div className="command-layer" role="dialog" aria-modal="true">
          <button className="command-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
          <Command className="command-dialog">
            <Command.Input autoFocus placeholder="Search actions..." />
            <Command.List>
              <Command.Empty>No results found.</Command.Empty>
              <Command.Group heading="Settings">
                {actions.map(([label, shortcut]) => (
                  <Command.Item key={label} onSelect={() => run(label)}>
                    <span>{label}</span>
                    <kbd>{shortcut}</kbd>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      ) : null}
    </div>
  );
}
