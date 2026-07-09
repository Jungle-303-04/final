import { Command } from "cmdk";
import { useState } from "react";

const drafts = ["Fix failing test", "Explain flaky run", "Write release note"];

export default function CommandAiDraftLauncherExample() {
  const [draft, setDraft] = useState("No draft launched.");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Launch AI draft..." />
        <Command.List>
          <Command.Group heading="AI drafts">
            {drafts.map((item) => <Command.Item key={item} onSelect={() => setDraft(`Draft opened: ${item}`)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>Draft</strong>
        <span>{draft}</span>
      </aside>
    </div>
  );
}
