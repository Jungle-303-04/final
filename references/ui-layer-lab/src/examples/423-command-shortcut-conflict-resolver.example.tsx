import { Command } from "cmdk";
import { useState } from "react";

const shortcuts = [
  { key: "Cmd K", name: "명령 팔레트 열기" },
  { key: "Cmd K", name: "검색창 포커스" },
  { key: "Cmd J", name: "AI 패널 열기" }
];

export default function CommandShortcutConflictResolverExample() {
  const [selected, setSelected] = useState(shortcuts[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="단축키 충돌 검색" />
        <Command.List>
          <Command.Group heading="단축키">
            {shortcuts.map((shortcut) => (
              <Command.Item key={shortcut.name} onSelect={() => setSelected(shortcut)} value={shortcut.name}>
                {shortcut.name}
                <kbd>{shortcut.key}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{selected.name}</strong>
        <span>{selected.key === "Cmd K" ? "충돌 감지" : "충돌 없음"}</span>
      </aside>
    </div>
  );
}
