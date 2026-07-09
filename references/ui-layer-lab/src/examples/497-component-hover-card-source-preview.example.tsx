import { useState } from "react";

export default function ComponentHoverCardSourcePreviewExample() {
  const [open, setOpen] = useState(false);

  return (
    <section className="component-demo">
      <header>
        <strong>출처 호버 카드</strong>
        <span>AI 답변의 근거를 문맥 안에서 미리보기</span>
      </header>
      <p className="component-muted">
        실패 원인은 <button className="inline-link" onBlur={() => setOpen(false)} onFocus={() => setOpen(true)} onMouseEnter={() => setOpen(true)}>workflow 로그</button>에서 확인됩니다.
      </p>
      {open ? (
        <div className="hover-card">
          <strong>workflow.log:128</strong>
          <p>Timeout waiting for overlay role=dialog to become visible.</p>
        </div>
      ) : null}
    </section>
  );
}
