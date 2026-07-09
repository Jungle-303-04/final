import { Command } from "cmdk";
import { useState } from "react";

const shortcuts = [
  { name: "명령 열기", keys: "Cmd K", conflict: "없음" },
  { name: "AI 편집 실행", keys: "Cmd J", conflict: "브라우저 다운로드" },
  { name: "작업 트레이 전환", keys: "Cmd Shift J", conflict: "개발자 도구" }
];

export default function CommandHotkeyConflictsExample() {
  const [selected, setSelected] = useState(shortcuts[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="단축키 검색..." />
        <Command.List>
          <Command.Group heading="단축키">
            {shortcuts.map((item) => (
              <Command.Item aria-selected={selected.keys === item.keys} key={item.name} onSelect={() => setSelected(item)} value={item.name}>
                <span>{item.name}</span>
                <kbd>{item.keys}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside aria-live="polite" className="detail-panel">
        <strong>{selected.keys}</strong>
        <span>충돌: {selected.conflict}</span>
      </aside>
    </div>
  );
}
