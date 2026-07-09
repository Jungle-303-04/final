import { useState } from "react";
import { toast } from "sonner";

export default function SonnerOptimisticSaveExample() {
  const [status, setStatus] = useState("초안에 로컬 변경이 있습니다.");

  function save() {
    setStatus("로컬 저장 완료. 원격 동기화 중...");
    const id = toast.loading("초안을 저장하는 중...");
    window.setTimeout(() => {
      toast.success("초안 저장됨", { id });
      setStatus("원격 저장 완료.");
    }, 900);
  }

  return (
    <div className="toast-state-card">
      <strong>낙관적 저장</strong>
      <span>{status}</span>
      <button className="command-trigger stable-wide" onClick={save} type="button">초안 저장</button>
    </div>
  );
}
