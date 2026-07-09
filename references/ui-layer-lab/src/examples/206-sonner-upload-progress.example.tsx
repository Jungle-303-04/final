import { useState } from "react";
import { toast } from "sonner";

export default function SonnerUploadProgressExample() {
  const [progress, setProgress] = useState(0);

  function upload() {
    const id = toast.loading("아티팩트 업로드 중...");
    [25, 55, 82, 100].forEach((value, index) => {
      window.setTimeout(() => {
        setProgress(value);
        toast(value === 100 ? "업로드 완료" : `업로드 ${value}%`, { id });
      }, index * 450);
    });
  }

  return (
    <div className="toast-state-card">
      <strong>아티팩트 업로드</strong>
      <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
      <button className="command-trigger stable-wide" onClick={upload} type="button">업로드</button>
    </div>
  );
}
