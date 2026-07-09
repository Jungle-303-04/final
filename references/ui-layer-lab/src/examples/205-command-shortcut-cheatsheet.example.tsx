import { Command } from "cmdk";

const shortcuts = [
  ["명령 열기", "⌘K"],
  ["로그 열기", "⌘L"],
  ["AI 전환", "⌘I"],
  ["작업으로 이동", "G J"]
];

export default function CommandShortcutCheatsheetExample() {
  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="단축키 검색..." />
      <Command.List>
        <Command.Group heading="키보드">
          {shortcuts.map(([label, keys]) => (
            <Command.Item key={label}>
              <span>{label}</span>
              <kbd>{keys}</kbd>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
