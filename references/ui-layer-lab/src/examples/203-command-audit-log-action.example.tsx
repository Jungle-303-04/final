import { Command } from "cmdk";
import { useState } from "react";

const events = ["Deploy approved", "Cache purged", "Secret rotated"];

export default function CommandAuditLogActionExample() {
  const [audit, setAudit] = useState("No audit event selected.");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Search audit actions..." />
        <Command.List>
          <Command.Group heading="Audit events">
            {events.map((event) => (
              <Command.Item key={event} onSelect={() => setAudit(`${event} copied to clipboard.`)}>
                {event}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>Audit trail</strong>
        <span>{audit}</span>
      </aside>
    </div>
  );
}
