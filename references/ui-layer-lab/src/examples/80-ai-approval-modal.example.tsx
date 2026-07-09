import { useState } from "react";
import { useEscapeClose } from "./shared/useEscapeClose";

export default function AiApprovalModalExample() {
  const [open, setOpen] = useState(false);
  const [approved, setApproved] = useState(false);
  useEscapeClose(open, () => setOpen(false));

  return (
    <div className="example-stack">
      <button className="command-trigger stable-wide" onClick={() => setOpen(true)} type="button">
        도구 승인 요청
      </button>
      <span className="muted">{approved ? "승인됨" : "대기 중"}</span>
      {open ? (
        <div className="approval-layer" role="dialog" aria-label="AI 도구 승인" aria-modal="true">
          <button className="approval-backdrop" aria-label="닫기" onClick={() => setOpen(false)} type="button" />
          <section className="approval-dialog">
            <strong>AI가 git diff를 실행해도 될까요?</strong>
            <span>이 명령은 로컬 변경 사항을 읽고 요약을 반환합니다.</span>
            <div className="tool-call-actions">
              <button onClick={() => setOpen(false)} type="button">거부</button>
              <button
                onClick={() => {
                  setApproved(true);
                  setOpen(false);
                }}
                type="button"
              >
                허용
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
