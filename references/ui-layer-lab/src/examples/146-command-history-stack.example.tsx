import { Command } from "cmdk";
import { useState } from "react";

const actions = ["로그 열기", "실패 설명", "패치 생성", "작업 재실행"];

export default function CommandHistoryStackExample() {
  const [history, setHistory] = useState(["로그 열기"]);

  function run(action: string) {
    setHistory((items) => [action, ...items].slice(0, 5));
  }

  return (
    <div className="command-filter-demo">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="실행할 작업 검색..." />
        <Command.List>
          <Command.Group heading="작업">
            {actions.map((action) => (
              <Command.Item key={action} onSelect={() => run(action)}>
                {action}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <div className="history-stack">
        {history.map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </div>
  );
}
