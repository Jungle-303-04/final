import { useState } from "react";
import { useEscapeClose } from "./shared/useEscapeClose";

export default function ComponentDialogCommandPreviewExample() {
  const [open, setOpen] = useState(false);
  useEscapeClose(open, () => setOpen(false));

  return (
    <section className="component-demo">
      <header>
        <strong>명령 미리보기 대화상자</strong>
        <span>실행 전에 대상과 변경 범위를 한 번 더 확인</span>
      </header>
      <button className="component-primary" onClick={() => setOpen(true)} type="button">
        명령 열기
      </button>

      {open ? (
        <div className="component-modal-layer">
          <button className="component-backdrop-button" aria-label="닫기" onClick={() => setOpen(false)} type="button" />
          <div className="component-modal wide">
            <strong>캐시 재생성</strong>
            <p>선택한 workspace의 검색 인덱스와 AI 컨텍스트 캐시를 다시 만듭니다.</p>
            <div className="component-preview-box">
              <span>대상</span>
              <strong>ui-layer-lab / production</strong>
            </div>
            <div className="component-actions">
              <button onClick={() => setOpen(false)} type="button">닫기</button>
              <button onClick={() => setOpen(false)} type="button">실행</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
