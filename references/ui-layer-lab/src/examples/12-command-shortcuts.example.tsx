import { Command } from "cmdk";
import { useEffect, useState } from "react";

const actions = [
  ["프로필 열기", "⌘P"],
  ["결제 정보 열기", "⌘B"],
  ["설정 열기", "⌘S"],
  ["저장소 만들기", "⌘N"]
];

export default function CommandShortcutsExample() {
  const [open, setOpen] = useState(false);
  const [lastAction, setLastAction] = useState("선택한 액션 없음");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function run(action: string) {
    setLastAction(action);
    setOpen(false);
  }

  return (
    <div className="command-demo">
      <div className="result-panel">
        <strong>선택한 액션</strong>
        <span>{lastAction}</span>
        <button className="command-trigger stable-wide" onClick={() => setOpen(true)} type="button">
          메뉴 열기
        </button>
      </div>

      {open ? (
        <div className="command-layer" role="dialog" aria-modal="true">
          <button className="command-backdrop" aria-label="닫기" onClick={() => setOpen(false)} type="button" />
          <Command className="command-dialog">
            <Command.Input autoFocus placeholder="실행할 액션을 검색하세요" />
            <Command.List>
              <Command.Empty>검색 결과가 없습니다.</Command.Empty>
              <Command.Group heading="설정">
                {actions.map(([label, shortcut]) => (
                  <Command.Item key={label} onSelect={() => run(label)}>
                    <span>{label}</span>
                    <kbd>{shortcut}</kbd>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      ) : null}
    </div>
  );
}
