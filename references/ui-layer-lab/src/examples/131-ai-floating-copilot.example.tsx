import { useState } from "react";

export default function AiFloatingCopilotExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fake-page">
      <strong>현재 앱 화면</strong>
      <p>코파일럿은 라우트를 바꾸지 않고 현재 화면 위에 떠 있습니다.</p>
      <button className="copilot-button" onClick={() => setOpen((value) => !value)} type="button">
        AI
      </button>
      {open ? (
        <section className="copilot-panel">
          <strong>어떻게 도와드릴까요?</strong>
          <input placeholder="이 화면에 대해 질문하세요" />
        </section>
      ) : null}
    </div>
  );
}
