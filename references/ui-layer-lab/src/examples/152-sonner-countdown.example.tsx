import { toast } from "sonner";

export default function SonnerCountdownExample() {
  function start() {
    const id = toast("3초 뒤 재시도...");
    window.setTimeout(() => toast("2초 뒤 재시도...", { id }), 600);
    window.setTimeout(() => toast("1초 뒤 재시도...", { id }), 1200);
    window.setTimeout(() => toast.success("재시도를 시작했습니다", { id }), 1800);
  }

  return (
    <button className="command-trigger stable-wide" onClick={start} type="button">
      카운트다운 시작
    </button>
  );
}
