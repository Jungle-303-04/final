import { Command } from "cmdk";
import { useState } from "react";

const filters = ["failed", "mine", "visual", "deploy"];

export default function CommandRecentFilterPillsExample() {
  const [recent, setRecent] = useState(["failed"]);

  function useFilter(filter: string) {
    setRecent((items) => [filter, ...items.filter((item) => item !== filter)].slice(0, 3));
  }

  return (
    <div className="command-filter-demo">
      <div className="chip-row">{recent.map((item) => <button className="active" key={item}>{item}</button>)}</div>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Apply filter..." />
        <Command.List>
          <Command.Group heading="Filters">
            {filters.map((filter) => <Command.Item key={filter} onSelect={() => useFilter(filter)}>{filter}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
