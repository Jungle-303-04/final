import { useState } from "react";
import { toast } from "sonner";

export default function SonnerAutosaveStatusExample() {
  const [text, setText] = useState("초안 메모");
  const [saved, setSaved] = useState("저장됨");

  function change(value: string) {
    setText(value);
    setSaved("저장 중...");
    window.setTimeout(() => {
      setSaved("방금 저장됨");
      toast.success("자동 저장됨");
    }, 600);
  }

  return (
    <div className="attachment-card">
      <strong>{saved}</strong>
      <textarea value={text} onChange={(event) => change(event.target.value)} />
    </div>
  );
}
