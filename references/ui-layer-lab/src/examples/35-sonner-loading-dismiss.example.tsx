import { toast } from "sonner";

export default function SonnerLoadingDismissExample() {
  function start() {
    const id = toast.loading("클러스터 동기화 실행 중...");

    window.setTimeout(() => {
      toast.dismiss(id);
      toast.success("클러스터 동기화 완료");
    }, 1600);
  }

  return (
    <button className="command-trigger" onClick={start} type="button">
      로딩 알림 시작
    </button>
  );
}
