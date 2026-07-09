import { Command } from "cmdk";
import { useMemo, useState } from "react";

const filters = ["all", "files", "jobs", "settings"];
const commands = [
  { label: "Open package.json", type: "files" },
  { label: "Run typecheck", type: "jobs" },
  { label: "Toggle dark mode", type: "settings" },
  { label: "Inspect workflow run", type: "jobs" },
  { label: "Open App.tsx", type: "files" }
];

export default function CommandFilterTagsExample() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const results = useMemo(
    () =>
      commands.filter((command) => {
        const byFilter = filter === "all" || command.type === filter;
        const bySearch = command.label.toLowerCase().includes(search.toLowerCase());
        return byFilter && bySearch;
      }),
    [filter, search]
  );

  return (
    <div className="command-filter-demo">
      <div className="segmented-row">
        {filters.map((item) => (
          <button className={item === filter ? "active" : ""} key={item} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      <Command shouldFilter={false} className="command-dialog inline-command">
        <Command.Input value={search} onValueChange={setSearch} placeholder="Filter commands..." />
        <Command.List>
          <Command.Group heading={filter}>
            {results.map((command) => (
              <Command.Item key={command.label}>
                <span>{command.label}</span>
                <kbd>{command.type}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
          {results.length === 0 ? <Command.Empty>No commands found.</Command.Empty> : null}
        </Command.List>
      </Command>
    </div>
  );
}
