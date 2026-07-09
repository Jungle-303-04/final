import { useState } from "react";

const logs = ["설치 완료", "타입 검사 완료", "시각 검사 실패"];

export default function AnimatedCollapsibleLogExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="collapsible-log">
      <button className="command-trigger stable-wide" onClick={() => setOpen((value) => !value)} type="button">
        {open ? "로그 숨기기" : "로그 보기"}
      </button>
      {open ? (
        <pre className="terminal-log">
          {logs.map((line) => (
            <code key={line}>{line}</code>
          ))}
        </pre>
      ) : null}
    </div>
  );
}
