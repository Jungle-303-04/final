import { useState } from "react";
import { useEscapeClose } from "./shared/useEscapeClose";

export default function ComponentAlertDialogDangerRunExample() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("실행 중인 작업이 있습니다.");
  useEscapeClose(open, () => setOpen(false));

  return (
    <section className="component-demo">
      <header>
        <strong>위험 작업 확인 대화상자</strong>
        <span>취소나 삭제처럼 되돌리기 어려운 액션에 사용</span>
      </header>
      <button className="component-primary danger" onClick={() => setOpen(true)} type="button">
        배포 중단
      </button>
      <p className="component-muted">{status}</p>

      {open ? (
        <div className="component-modal-layer">
          <button className="component-backdrop-button" aria-label="닫기" onClick={() => setOpen(false)} type="button" />
          <div className="component-modal">
            <strong>정말 배포를 중단할까요?</strong>
            <p>현재 실행 중인 job과 runner slot이 취소됩니다. 로그와 아티팩트는 보존됩니다.</p>
            <div className="component-actions">
              <button onClick={() => setOpen(false)} type="button">계속 실행</button>
              <button
                className="danger"
                onClick={() => {
                  setOpen(false);
                  setStatus("배포 중단 요청이 등록되었습니다.");
                }}
                type="button"
              >
                중단하기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
