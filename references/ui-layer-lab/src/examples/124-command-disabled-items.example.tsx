import { Command } from "cmdk";

const actions = [
  { name: "Push branch", disabled: false },
  { name: "Deploy production", disabled: true },
  { name: "Open logs", disabled: false }
];

export default function CommandDisabledItemsExample() {
  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="Search guarded actions..." />
      <Command.List>
        <Command.Group heading="Actions">
          {actions.map((action) => (
            <Command.Item disabled={action.disabled} key={action.name}>
              <span>{action.name}</span>
              <kbd>{action.disabled ? "locked" : "ready"}</kbd>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
