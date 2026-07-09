import { Command } from "cmdk";
import { useState } from "react";

const actions = ["워크플로 로그 열기", "실패 작업 재시도", "현재 페이지를 AI에게 질문", "배포 메모 만들기"];

export default function CommandRecentActionsExample() {
  const [recent, setRecent] = useState(["워크플로 로그 열기", "현재 페이지를 AI에게 질문"]);

  function run(action: string) {
    setRecent((items) => [action, ...items.filter((item) => item !== action)].slice(0, 3));
  }

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="액션을 검색하세요" />
      <Command.List>
        <Command.Group heading="최근 실행">
          {recent.map((action) => (
            <Command.Item key={action} onSelect={() => run(action)}>
              <span>{action}</span>
              <kbd>최근</kbd>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="전체 액션">
          {actions.map((action) => (
            <Command.Item key={action} onSelect={() => run(action)}>
              {action}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
