import { toast } from "sonner";
import { useState } from "react";

export default function SonnerCancelJobExample() {
  const [status, setStatus] = useState("대기");

  function start() {
    setStatus("실행 중");
    const id = toast.loading("요약 생성 중...", {
      action: {
        label: "취소",
        onClick: () => {
          setStatus("취소됨");
          toast.dismiss(id);
          toast.warning("요약이 취소되었습니다");
        }
      }
    });

    window.setTimeout(() => {
      setStatus((current) => {
        if (current === "취소됨") return current;
        toast.success("요약 준비 완료", { id });
        return "완료";
      });
    }, 1800);
  }

  return (
    <div className="example-stack">
      <button className="command-trigger" onClick={start} type="button">
        요약 시작
      </button>
      <span className="muted">{status}</span>
    </div>
  );
}
