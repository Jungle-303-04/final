import { useState } from "react";

export default function AiOverlayInlineComposerDockExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="fake-page">
      <strong>현재 제품 화면</strong>
      <p>페이지를 떠나지 않고 AI 입력창을 화면 위에 고정합니다.</p>
      <button className="command-trigger stable-wide" onClick={() => setOpen((value) => !value)} type="button">{open ? "입력창 숨기기" : "입력창 보기"}</button>
      {open ? (
        <aside className="floating-job-center">
          <strong>AI에게 묻기</strong>
          <input className="search-input" placeholder="이번 실행을 설명해 주세요" />
        </aside>
      ) : null}
    </div>
  );
}
