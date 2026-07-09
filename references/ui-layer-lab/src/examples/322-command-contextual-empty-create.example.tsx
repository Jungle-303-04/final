import { Command } from "cmdk";
import { useState } from "react";

const initial = ["deploy preview", "run smoke", "open logs"];

export default function CommandContextualEmptyCreateExample() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(initial);
  const filtered = items.filter((item) => item.includes(query.toLowerCase()));
  const canCreate = query.trim().length > 0 && filtered.length === 0;

  function create() {
    setItems((value) => [query, ...value]);
    setQuery("");
  }

  return (
    <Command shouldFilter={false} className="command-dialog inline-command">
      <Command.Input value={query} onValueChange={setQuery} placeholder="Search action..." />
      <Command.List>
        {canCreate ? <Command.Item onSelect={create}>Create "{query}"</Command.Item> : null}
        <Command.Group heading="Actions">
          {filtered.map((item) => <Command.Item key={item}>{item}</Command.Item>)}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
