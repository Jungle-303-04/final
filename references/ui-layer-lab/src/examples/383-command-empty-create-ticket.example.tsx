import { Command } from "cmdk";
import { useState } from "react";

const tickets = ["login regression", "visual diff", "slow deploy"];

export default function CommandEmptyCreateTicketExample() {
  const [query, setQuery] = useState("new incident");
  const [created, setCreated] = useState("No ticket created");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input onValueChange={setQuery} placeholder="Search tickets..." value={query} />
        <Command.List>
          <Command.Empty>
            <div className="empty-state">
              <strong>No matching ticket</strong>
              <button onClick={() => setCreated(`Created ${query}`)}>Create "{query}"</button>
            </div>
          </Command.Empty>
          <Command.Group heading="Tickets">
            {tickets.map((ticket) => (
              <Command.Item key={ticket} onSelect={() => setCreated(`Opened ${ticket}`)} value={ticket}>
                {ticket}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{created}</strong>
        <span>Empty state can become an action</span>
      </aside>
    </div>
  );
}
