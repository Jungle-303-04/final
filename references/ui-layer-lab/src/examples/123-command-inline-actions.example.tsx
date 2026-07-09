import { Command } from "cmdk";
import { useState } from "react";

const rows = ["visual-smoke", "typecheck", "deploy-preview"];

export default function CommandInlineActionsExample() {
  const [message, setMessage] = useState("Choose a row action.");

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="Search runs..." />
      <Command.List>
        <Command.Group heading="Runs">
          {rows.map((row) => (
            <Command.Item key={row}>
              <span>{row}</span>
              <span className="inline-actions">
                <button onClick={() => setMessage(`Opening ${row}`)}>Open</button>
                <button onClick={() => setMessage(`Retrying ${row}`)}>Retry</button>
              </span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      <div className="command-footer">{message}</div>
    </Command>
  );
}
