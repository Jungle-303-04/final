import { toast } from "sonner";

export default function SonnerActionExample() {
  return (
    <button
      className="command-trigger"
      onClick={() =>
        toast("배포에 실패했습니다", {
          description: "시각 검증을 통과하지 못했습니다.",
          action: {
            label: "재시도",
            onClick: () => toast.success("재시도가 대기열에 등록되었습니다")
          }
        })
      }
      type="button"
    >
      액션 알림 보기
    </button>
  );
}
