import { Command } from "cmdk";
import { useState } from "react";

const filters = ["status:failed", "owner:me", "type:deploy", "branch:main"];

export default function CommandFilterBuilderExample() {
  const [selected, setSelected] = useState(["status:failed"]);

  function toggle(filter: string) {
    setSelected((items) => (items.includes(filter) ? items.filter((item) => item !== filter) : [...items, filter]));
  }

  return (
    <div className="command-filter-demo">
      <div className="chip-row">
        {selected.map((filter) => <button className="active" key={filter}>{filter}</button>)}
      </div>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Add filter..." />
        <Command.List>
          <Command.Group heading="Filters">
            {filters.map((filter) => (
              <Command.Item key={filter} onSelect={() => toggle(filter)}>
                <span>{filter}</span>
                <kbd>{selected.includes(filter) ? "on" : "off"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
