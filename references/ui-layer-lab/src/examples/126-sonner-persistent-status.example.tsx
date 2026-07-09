import { toast } from "sonner";

export default function SonnerPersistentStatusExample() {
  function show() {
    toast.info("CI 대기 중", {
      description: "닫기 전까지 유지되는 상태 토스트입니다.",
      duration: Infinity
    });
  }

  return (
    <button className="command-trigger stable-wide" onClick={show} type="button">
      상태 토스트 표시
    </button>
  );
}
