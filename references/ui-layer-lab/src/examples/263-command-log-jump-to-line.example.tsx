import { Command } from "cmdk";
import { useState } from "react";

const lines = ["18행 설치", "42행 빌드", "87행 시각 검사", "104행 업로드"];

export default function CommandLogJumpToLineExample() {
  const [line, setLine] = useState("42행 빌드");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="로그 줄로 이동..." />
        <Command.List>
          <Command.Group heading="로그 줄">
            {lines.map((item) => <Command.Item key={item} onSelect={() => setLine(item)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <pre className="terminal-log"><code>선택한 줄 {line}</code></pre>
    </div>
  );
}
