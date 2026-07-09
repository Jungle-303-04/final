import { Command } from "cmdk";
import { useState } from "react";

const suggestions = ["is:failed", "label:visual", "branch:preview", "owner:me"];

export default function CommandQuerySuggestionsExample() {
  const [query, setQuery] = useState(["is:failed"]);

  function addToken(token: string) {
    setQuery((items) => (items.includes(token) ? items : [...items, token]));
  }

  return (
    <div className="command-filter-demo">
      <strong>{query.join(" ")}</strong>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Add query token..." />
        <Command.List>
          <Command.Group heading="Suggestions">
            {suggestions.map((item) => (
              <Command.Item key={item} onSelect={() => addToken(item)}>
                <span>{item}</span>
                <kbd>{query.includes(item) ? "on" : "add"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
