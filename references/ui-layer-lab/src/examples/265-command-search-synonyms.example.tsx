import { Command } from "cmdk";
import { useState } from "react";

const synonyms = {
  fail: ["failed", "error", "broken"],
  deploy: ["release", "ship", "promote"],
  ai: ["assistant", "copilot", "agent"]
};

export default function CommandSearchSynonymsExample() {
  const [term, setTerm] = useState<keyof typeof synonyms>("fail");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Search synonym groups..." />
        <Command.List>
          <Command.Group heading="Terms">
            {Object.keys(synonyms).map((item) => <Command.Item key={item} onSelect={() => setTerm(item as keyof typeof synonyms)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{term}</strong>
        <span>{synonyms[term].join(", ")}</span>
      </aside>
    </div>
  );
}
