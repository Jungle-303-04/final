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
      <strong>{selected.length}개 행 선택됨</strong>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="행 선택..." />
        <Command.List>
          <Command.Group heading="실행 행">
            {rows.map((row) => (
              <Command.Item key={row} onSelect={() => toggle(row)}>
                <span>{row}</span>
                <kbd>{selected.includes(row) ? "선택" : "해제"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
