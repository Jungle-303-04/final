import { toast } from "sonner";

export default function SonnerReportErrorExample() {
  function report() {
    toast.error("푸시 실패", {
      description: "원격 저장소가 업데이트를 거절했습니다.",
      action: {
        label: "로그 보기",
        onClick: () => toast.info("푸시 로그를 여는 중입니다.")
      }
    });
  }

  return (
    <button className="command-trigger stable-wide" onClick={report} type="button">
      오류 보고
    </button>
  );
}
