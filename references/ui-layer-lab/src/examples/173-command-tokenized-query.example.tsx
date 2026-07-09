import { Command } from "cmdk";
import { useMemo, useState } from "react";

const results = ["repo:web status:failed", "repo:api owner:me", "tag:ai file:diff.tsx"];

export default function CommandTokenizedQueryExample() {
  const [query, setQuery] = useState("repo:web status:failed");
  const tokens = useMemo(() => query.split(" ").filter(Boolean), [query]);

  return (
    <div className="command-filter-demo">
      <div className="chip-row">
        {tokens.map((token) => (
          <button className="active" key={token}>{token}</button>
        ))}
      </div>
      <Command className="command-dialog inline-command">
        <Command.Input value={query} onValueChange={setQuery} placeholder="repo:web status:failed" />
        <Command.List>
          <Command.Group heading="Parsed results">
            {results.map((item) => (
              <Command.Item key={item}>{item}</Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
