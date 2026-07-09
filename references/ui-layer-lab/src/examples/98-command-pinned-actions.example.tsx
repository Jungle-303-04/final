import { Command } from "cmdk";
import { useState } from "react";

const actions = ["AI에게 질문", "로그 열기", "테스트 실행", "브랜치 푸시"];

export default function CommandPinnedActionsExample() {
  const [pinned, setPinned] = useState(["AI에게 질문"]);

  function toggle(action: string) {
    setPinned((items) => (items.includes(action) ? items.filter((item) => item !== action) : [...items, action]));
  }

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="중요 액션을 고정하세요" />
      <Command.List>
        <Command.Group heading="고정됨">
          {pinned.map((action) => (
            <Command.Item key={action} onSelect={() => toggle(action)}>
              <span>{action}</span>
              <kbd>고정</kbd>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="전체">
          {actions.map((action) => (
            <Command.Item key={action} onSelect={() => toggle(action)}>
              <span>{action}</span>
              <kbd>{pinned.includes(action) ? "해제" : "고정"}</kbd>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
