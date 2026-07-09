import { Command } from "cmdk";
import { useState } from "react";

export default function CommandInlineProgressExample() {
  const [running, setRunning] = useState(false);

  function start() {
    setRunning(true);
    window.setTimeout(() => setRunning(false), 1400);
  }

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="작업 명령을 선택하세요..." />
      <Command.List>
        <Command.Group heading="작업">
          <Command.Item onSelect={start}>
            <span>최신 변경 가져오기</span>
            <span aria-live="polite" className={running ? "inline-loader stable-text-slot active" : "inline-loader stable-text-slot"}>{running ? "실행 중" : "대기"}</span>
          </Command.Item>
          <Command.Item>
            <span>워크플로 로그 열기</span>
            <kbd>⌘L</kbd>
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
