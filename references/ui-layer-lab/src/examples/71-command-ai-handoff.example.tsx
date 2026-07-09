import { Command } from "cmdk";
import { useState } from "react";

const commands = ["Explain failed run", "Summarize latest logs", "Draft rollback plan"];

export default function CommandAiHandoffExample() {
  const [selected, setSelected] = useState("Explain failed run");
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="split-demo">
      <Command className="command-dialog inline-command" value={selected} onValueChange={setSelected}>
        <Command.Input placeholder="Ask AI or run a command..." />
        <Command.List>
          <Command.Group heading="AI actions">
            {commands.map((command) => (
              <Command.Item key={command} value={command} onSelect={() => setChatOpen(true)}>
                {command}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{chatOpen ? selected : "AI handoff"}</strong>
        <span>{chatOpen ? "Chat opens with the selected command as context." : "Select an action to start chat."}</span>
      </aside>
    </div>
  );
}
