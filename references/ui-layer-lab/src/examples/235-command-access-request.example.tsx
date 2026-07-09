import { Command } from "cmdk";
import { useState } from "react";

export default function CommandAccessRequestExample() {
  const [message, setMessage] = useState("Production deploy is restricted.");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Search restricted actions..." />
        <Command.List>
          <Command.Group heading="Restricted">
            <Command.Item onSelect={() => setMessage("Access request sent to admins.")}>
              <span>Request production deploy access</span>
              <kbd>locked</kbd>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>Access</strong>
        <span>{message}</span>
      </aside>
    </div>
  );
}
