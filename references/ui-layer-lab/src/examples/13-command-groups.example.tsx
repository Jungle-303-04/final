import { Command } from "cmdk";
import { useState } from "react";

const groups: Array<[string, string[]]> = [
  ["Suggestions", ["Calendar", "Search logs", "Calculator"]],
  ["Git", ["Pull latest", "Push branch", "Open pull request"]],
  ["AI", ["Ask AI", "Explain failure", "Summarize run"]]
];

export default function CommandGroupsExample() {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState("Ask AI");

  return (
    <div className="command-demo">
      <div className="inline-command-layout">
        <Command className="command-dialog inline-command">
          <Command.Input placeholder="Search grouped commands..." />
          <Command.List>
            <Command.Empty>No results found.</Command.Empty>
            {groups.map(([heading, items]) => (
              <Command.Group heading={heading} key={heading}>
                {items.map((item) => (
                  <Command.Item key={item} onSelect={() => setSelected(item)}>
                    <span className="command-icon">{item.slice(0, 1)}</span>
                    <span>{item}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
        <div className="result-panel">
          <strong>Selected command</strong>
          <span>{selected}</span>
          <button className="command-trigger" onClick={() => setOpen((value) => !value)}>
            Toggle result
          </button>
          {open ? <p className="muted">This side panel can become your command result preview.</p> : null}
        </div>
      </div>
    </div>
  );
}
