import { useState } from "react";

export default function AnimatedOverlayExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="animation-demo">
      <button className="command-trigger stable-wide" onClick={() => setOpen(true)} type="button">
        오버레이 열기
      </button>

      {open ? (
        <div className="animated-layer">
          <button className="animated-backdrop" aria-label="닫기" onClick={() => setOpen(false)} type="button" />
          <div className="animated-panel">
            <strong>AI job 준비</strong>
            <span>현재 화면 컨텍스트와 선택 log를 불러왔습니다.</span>
            <button onClick={() => setOpen(false)} type="button">닫기</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
