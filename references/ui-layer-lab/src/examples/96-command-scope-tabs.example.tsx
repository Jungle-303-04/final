import { Command } from "cmdk";
import { useMemo, useState } from "react";

const scopes = ["all", "files", "runs", "docs"];
const items = [
  { name: "Open App.tsx", scope: "files" },
  { name: "Inspect failed run", scope: "runs" },
  { name: "Read target spec", scope: "docs" },
  { name: "Open workflow.yaml", scope: "files" }
];

export default function CommandScopeTabsExample() {
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");

  const results = useMemo(
    () =>
      items.filter((item) => {
        const scopeMatch = scope === "all" || item.scope === scope;
        return scopeMatch && item.name.toLowerCase().includes(search.toLowerCase());
      }),
    [scope, search]
  );

  return (
    <div className="command-filter-demo">
      <div className="segmented-row">
        {scopes.map((item) => (
          <button className={scope === item ? "active" : ""} key={item} onClick={() => setScope(item)}>
            {item}
          </button>
        ))}
      </div>
      <Command shouldFilter={false} className="command-dialog inline-command">
        <Command.Input value={search} onValueChange={setSearch} placeholder="Search current scope..." />
        <Command.List>
          <Command.Group heading={scope}>
            {results.map((item) => (
              <Command.Item key={item.name}>
                <span>{item.name}</span>
                <kbd>{item.scope}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
