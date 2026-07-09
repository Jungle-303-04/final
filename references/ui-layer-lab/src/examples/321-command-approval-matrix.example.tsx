import { Command } from "cmdk";
import { useState } from "react";

const approvals = [
  { action: "Deploy preview", owner: "maintainer", state: "allowed" },
  { action: "Push production", owner: "release lead", state: "approval required" },
  { action: "Rotate secret", owner: "admin", state: "blocked" }
];

export default function CommandApprovalMatrixExample() {
  const [selected, setSelected] = useState(approvals[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Check action permission..." />
        <Command.List>
          <Command.Group heading="Approval matrix">
            {approvals.map((approval) => (
              <Command.Item key={approval.action} onSelect={() => setSelected(approval)}>
                <span>{approval.action}</span>
                <kbd>{approval.owner}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{selected.action}</strong>
        <span>{selected.state}</span>
      </aside>
    </div>
  );
}
