import { toast } from "sonner";

export default function SonnerQueuedToastsExample() {
  function queue() {
    ["대기 중", "실행 중", "완료"].forEach((state, index) => {
      window.setTimeout(() => toast(state), index * 500);
    });
  }

  return (
    <button className="command-trigger stable-wide" onClick={queue} type="button">
      토스트 대기열 표시
    </button>
  );
}
