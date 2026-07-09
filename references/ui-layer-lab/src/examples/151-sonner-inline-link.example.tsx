import { toast } from "sonner";

export default function SonnerInlineLinkExample() {
  function show() {
    toast("워크플로 실패", {
      description: "실행 상세에서 로그를 확인하세요.",
      action: {
        label: "열기",
        onClick: () => toast.info("실행 상세를 열었습니다")
      }
    });
  }

  return (
    <button className="command-trigger stable-wide" onClick={show} type="button">
      링크 토스트 표시
    </button>
  );
}
