import { useState } from "react";

export default function AnimatedCommandBarExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="command-bar-stage">
      <button className="command-trigger stable-wide" onClick={() => setOpen((value) => !value)} type="button">
        명령 바 전환
      </button>
      {open ? (
        <div className="bottom-command-bar">
          <input autoFocus placeholder="이 화면에 대해 질문하세요" />
          <button type="button">전송</button>
        </div>
      ) : null}
    </div>
  );
}
