import { Command } from "cmdk";
import { useState } from "react";

const rows = ["visual-smoke", "typecheck", "deploy-preview"];

export default function CommandInlineActionsExample() {
  const [message, setMessage] = useState("행 액션을 선택하세요.");

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="실행 항목 검색" />
      <Command.List>
        <Command.Group heading="실행">
          {rows.map((row) => (
            <Command.Item key={row}>
              <span>{row}</span>
              <span className="inline-actions">
                <button onClick={() => setMessage(`${row} 열기`)} type="button">열기</button>
                <button onClick={() => setMessage(`${row} 재시도`)} type="button">재시도</button>
              </span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      <div className="command-footer">{message}</div>
    </Command>
  );
}
