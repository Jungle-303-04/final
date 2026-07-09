import { useState } from "react";
import { useEscapeClose } from "./shared/useEscapeClose";

export default function JobFloatingCenterExample() {
  const [open, setOpen] = useState(true);
  useEscapeClose(open, () => setOpen(false));

  return (
    <div className="fake-page">
      <strong>대시보드 콘텐츠</strong>
      <p>전역 작업 상태는 현재 화면 위에서 계속 확인할 수 있습니다.</p>
      {open ? (
        <section className="floating-job-center">
          <div className="drawer-header">
            <strong>작업 2개 실행 중</strong>
            <button onClick={() => setOpen(false)} type="button">닫기</button>
          </div>
          <div className="progress-track">
            <div style={{ width: "54%" }} />
          </div>
          <span>원격 변경을 가져오고 미리보기를 빌드하는 중입니다.</span>
        </section>
      ) : (
        <button className="command-trigger stable-wide" onClick={() => setOpen(true)} type="button">
          작업 센터 표시
        </button>
      )}
    </div>
  );
}
