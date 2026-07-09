import { useState, type KeyboardEvent } from "react";

export default function CommandHotkeyRecorderExample() {
  const [hotkey, setHotkey] = useState("⌘K");

  function record(event: KeyboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const parts = [event.metaKey || event.ctrlKey ? "⌘" : "", event.shiftKey ? "⇧" : "", event.key.toUpperCase()].filter(Boolean);
    setHotkey(parts.join(""));
  }

  return (
    <div className="hotkey-card">
      <strong>Command palette hotkey</strong>
      <input onKeyDown={record} placeholder="Press shortcut" />
      <kbd>{hotkey}</kbd>
    </div>
  );
}
