import { useState } from "react";
import { useEscapeClose } from "./shared/useEscapeClose";

const logs = [
  "원격 객체 18개 확인",
  "객체 수신 100%",
  "델타 해석 73%",
  "작업공간 충돌 검사 중"
];

export default function JobLogDrawerExample() {
  const [open, setOpen] = useState(false);
  useEscapeClose(open, () => setOpen(false));

  return (
    <div className="example-stack">
      <button className="job-row" onClick={() => setOpen(true)} type="button">
        <span>git pull origin dev</span>
        <strong>64%</strong>
      </button>

      {open ? (
        <aside className="floating-drawer">
          <div className="drawer-header">
            <strong>git pull origin dev</strong>
            <button onClick={() => setOpen(false)} type="button">닫기</button>
          </div>
          <pre className="terminal-log">
            {logs.map((line) => (
              <code key={line}>{line}</code>
            ))}
          </pre>
        </aside>
      ) : null}
    </div>
  );
}
