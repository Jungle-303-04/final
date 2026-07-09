import { Command } from "cmdk";
import { useState } from "react";

const groups = {
  Code: ["Open diff", "Run formatter"],
  Jobs: ["Retry run", "Cancel queue"]
};

export default function CommandCollapsibleGroupsExample() {
  const [open, setOpen] = useState<keyof typeof groups>("Code");

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="Search grouped commands..." />
      <Command.List>
        {Object.entries(groups).map(([group, items]) => (
          <Command.Group heading={group} key={group}>
            <Command.Item onSelect={() => setOpen(group as keyof typeof groups)}>
              <span>{group}</span>
              <kbd>{open === group ? "open" : "show"}</kbd>
            </Command.Item>
            {open === group ? items.map((item) => <Command.Item key={item}>{item}</Command.Item>) : null}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  );
}
