import { toast } from "sonner";

export default function SonnerMultiActionExample() {
  function show() {
    toast.custom(() => (
      <div className="custom-toast">
        <strong>워크플로 실패</strong>
        <span>다음 액션을 선택하세요.</span>
        <div className="tool-call-actions">
          <button onClick={() => toast.info("로그를 여는 중")} type="button">
            로그
          </button>
          <button onClick={() => toast.info("재시도를 대기열에 추가했습니다")} type="button">
            재시도
          </button>
        </div>
      </div>
    ));
  }

  return (
    <button className="command-trigger stable-wide" onClick={show} type="button">
      액션 토스트 표시
    </button>
  );
}
