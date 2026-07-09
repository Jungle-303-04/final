import { Command } from "cmdk";
import { useState } from "react";

const actions = {
  Viewer: ["Open logs", "Copy run link"],
  Maintainer: ["Rerun job", "Approve deploy", "Open logs"],
  Admin: ["Rotate secret", "Delete preview", "Approve deploy"]
};

export default function CommandRoleSwitcherExample() {
  const [role, setRole] = useState<keyof typeof actions>("Viewer");

  return (
    <div className="inline-command-layout">
      <div className="segmented-row">
        {Object.keys(actions).map((item) => (
          <button className={role === item ? "active" : ""} key={item} onClick={() => setRole(item as keyof typeof actions)}>
            {item}
          </button>
        ))}
      </div>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder={`${role} actions...`} />
        <Command.List>
          <Command.Group heading={role}>
            {actions[role].map((action) => <Command.Item key={action}>{action}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
