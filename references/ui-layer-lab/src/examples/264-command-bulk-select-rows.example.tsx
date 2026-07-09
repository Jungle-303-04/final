import { Command } from "cmdk";
import { useState } from "react";

const rows = ["run-401", "run-402", "run-403"];

export default function CommandBulkSelectRowsExample() {
  const [selected, setSelected] = useState(["run-401"]);

  function toggle(row: string) {
    setSelected((items) => (items.includes(row) ? items.filter((item) => item !== row) : [...items, row]));
  }

  return (
    <div className="command-filter-demo">
      <strong>{selected.length} rows selected</strong>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Select rows..." />
        <Command.List>
          <Command.Group heading="Rows">
            {rows.map((row) => (
              <Command.Item key={row} onSelect={() => toggle(row)}>
                <span>{row}</span>
                <kbd>{selected.includes(row) ? "on" : "off"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
