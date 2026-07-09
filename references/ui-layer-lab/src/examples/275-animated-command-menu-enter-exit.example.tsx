import { useState } from "react";

export default function AnimatedCommandMenuEnterExitExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="command-pop-stage">
      <button aria-expanded={open} className="command-trigger stable-wide" onClick={() => setOpen((value) => !value)} type="button">
        {open ? "닫기" : "열기"}
      </button>
      {open ? (
        <div className="command-pop-card">
          <strong>명령 팔레트</strong>
          <span>작업을 검색하거나 실행하세요.</span>
        </div>
      ) : null}
    </div>
  );
}
