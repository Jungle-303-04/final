import { Command } from "cmdk";
import { useState } from "react";

const groups = {
  Files: ["src/App.tsx", "src/examples/registry.ts", "package.json"],
  Issues: ["Preview route returns 404", "Build cache is stale"],
  Docs: ["Command composition", "Sonner position API"]
};

export default function CommandFederatedSearchExample() {
  const [scope, setScope] = useState<keyof typeof groups | "All">("All");

  const entries = Object.entries(groups).filter(([group]) => scope === "All" || group === scope);

  return (
    <div className="command-filter-demo">
      <div className="segmented-row">
        {["All", ...Object.keys(groups)].map((item) => (
          <button className={scope === item ? "active" : ""} key={item} onClick={() => setScope(item as keyof typeof groups | "All")}>
            {item}
          </button>
        ))}
      </div>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Search files, issues, and docs..." />
        <Command.List>
          {entries.map(([group, items]) => (
            <Command.Group heading={group} key={group}>
              {items.map((item) => (
                <Command.Item key={item}>
                  <span>{item}</span>
                  <kbd>{group.slice(0, 1)}</kbd>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
