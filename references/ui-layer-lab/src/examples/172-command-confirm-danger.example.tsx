import { Command } from "cmdk";
import { useState } from "react";

export default function CommandConfirmDangerExample() {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("No destructive action selected.");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Run an action..." />
        <Command.List>
          <Command.Group heading="Safe">
            <Command.Item onSelect={() => setStatus("Logs opened.")}>Open logs</Command.Item>
            <Command.Item onSelect={() => setStatus("Dry run started.")}>Start dry run</Command.Item>
          </Command.Group>
          <Command.Group heading="Danger zone">
            <Command.Item onSelect={() => setConfirming(true)}>Delete preview environment</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{confirming ? "Confirm delete" : "Status"}</strong>
        <span>{confirming ? "This action removes the preview environment." : status}</span>
        {confirming ? (
          <button
            className="command-trigger"
            onClick={() => {
              setConfirming(false);
              setStatus("Preview environment deleted.");
            }}
          >
            Confirm
          </button>
        ) : null}
      </aside>
    </div>
  );
}
