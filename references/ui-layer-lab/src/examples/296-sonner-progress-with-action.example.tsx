import { useState } from "react";
import { toast } from "sonner";

export default function SonnerProgressWithActionExample() {
  const [progress, setProgress] = useState(35);

  function advance() {
    setProgress((value) => Math.min(100, value + 25));
    toast.info("업로드 진행률 갱신", {
      description: "아티팩트 묶음은 작업 트레이에서 계속 확인할 수 있습니다.",
      action: {
        label: "작업 트레이 열기",
        onClick: () => undefined
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong aria-live="polite">아티팩트 업로드 {progress}%</strong>
      <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
      <button className="command-trigger stable-wide" onClick={advance} type="button">업로드 진행</button>
    </div>
  );
}
