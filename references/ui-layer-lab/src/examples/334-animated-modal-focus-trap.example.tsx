import { useState } from "react";
import { useEscapeClose } from "./shared/useEscapeClose";

export default function AnimatedModalFocusTrapExample() {
  const [open, setOpen] = useState(false);
  useEscapeClose(open, () => setOpen(false));

  return (
    <div className="example-stack">
      <button className="command-trigger stable-wide" onClick={() => setOpen(true)} type="button">모달 열기</button>
      {open ? (
        <div className="approval-layer" role="dialog" aria-label="AI 편집 확인" aria-modal="true">
          <button className="approval-backdrop" aria-label="닫기" onClick={() => setOpen(false)} type="button" />
          <section className="approval-dialog">
            <strong>AI 편집 확인</strong>
            <span>닫기 전까지 포커스가 상단 레이어 안에 머뭅니다.</span>
            <button className="command-trigger stable-wide" onClick={() => setOpen(false)} type="button">모달 닫기</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
