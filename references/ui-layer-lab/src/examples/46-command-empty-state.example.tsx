import { Command } from "cmdk";
import { useMemo, useState } from "react";

const projects = ["console-web", "cluster-agent", "deploy-worker", "gateway-api"];

export default function CommandEmptyStateExample() {
  const [search, setSearch] = useState("");

  const results = useMemo(
    () => projects.filter((project) => project.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  return (
    <Command shouldFilter={false} className="command-dialog inline-command">
      <Command.Input value={search} onValueChange={setSearch} placeholder="Search project..." />
      <Command.List>
        {results.length > 0 ? (
          <Command.Group heading="Projects">
            {results.map((project) => (
              <Command.Item key={project}>{project}</Command.Item>
            ))}
          </Command.Group>
        ) : (
          <Command.Empty>
            <div className="empty-state">
              <strong>No project found</strong>
              <span>Create a new project from this query.</span>
              <button>Create "{search || "project"}"</button>
            </div>
          </Command.Empty>
        )}
      </Command.List>
    </Command>
  );
}
