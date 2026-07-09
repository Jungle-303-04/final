import { Command } from "cmdk";
import { useState } from "react";

const history = ["status:failed owner:me", "branch:main visual", "deploy preview"];

export default function CommandQueryHistoryExample() {
  const [query, setQuery] = useState("");

  return (
    <Command className="command-dialog inline-command">
      <Command.Input value={query} onValueChange={setQuery} placeholder="Search or reuse a query..." />
      <Command.List>
        <Command.Group heading="Recent queries">
          {history.map((item) => (
            <Command.Item key={item} onSelect={() => setQuery(item)}>
              {item}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
