import { Command } from "cmdk";
import { useState } from "react";

const actions = [
  { label: "التقارير", hint: "Reports" },
  { label: "السجلات", hint: "Logs" },
  { label: "الإعدادات", hint: "Settings" }
];

export default function CommandRtlInlineActionsExample() {
  const [selected, setSelected] = useState(actions[0]);

  return (
    <div className="inline-command-layout" dir="rtl">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="ابحث عن أمر..." />
        <Command.List>
          <Command.Group heading="أوامر">
            {actions.map((action) => (
              <Command.Item key={action.hint} onSelect={() => setSelected(action)} value={action.hint}>
                {action.label}
                <kbd>{action.hint}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel" dir="ltr">
        <strong>{selected.hint}</strong>
        <span>RTL command selected</span>
      </aside>
    </div>
  );
}
