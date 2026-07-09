import { Command } from "cmdk";
import { useState } from "react";

const snippets = {
  failure: "Explain the root cause of the failing step.",
  patch: "Create the smallest safe patch.",
  summary: "Summarize this run for the team."
};

export default function CommandSnippetInsertExample() {
  const [text, setText] = useState("Ask AI to: ");

  return (
    <div className="attachment-card">
      <textarea value={text} onChange={(event) => setText(event.target.value)} />
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Insert snippet..." />
        <Command.List>
          <Command.Group heading="Snippets">
            {Object.entries(snippets).map(([key, value]) => (
              <Command.Item key={key} onSelect={() => setText((current) => `${current}${value}`)}>
                <span>{key}</span>
                <kbd>tab</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
