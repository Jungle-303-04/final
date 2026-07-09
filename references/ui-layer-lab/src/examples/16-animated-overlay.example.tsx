import { useState } from "react";

export default function AnimatedOverlayExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="animation-demo">
      <button className="command-trigger" onClick={() => setOpen(true)}>
        오버레이 열기
      </button>

      {open ? (
        <div className="animated-layer">
          <button className="animated-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="animated-panel">
            <strong>AI 작업 준비</strong>
            <span>현재 화면 컨텍스트와 선택 로그를 불러왔습니다.</span>
            <button onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
