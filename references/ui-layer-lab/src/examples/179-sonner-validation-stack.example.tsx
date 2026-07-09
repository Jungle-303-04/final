import { useState } from "react";
import { toast } from "sonner";

export default function SonnerValidationStackExample() {
  const [name, setName] = useState("");

  function submit() {
    if (!name.trim()) {
      toast.error("프로젝트 이름이 필요합니다", { description: "계속하기 전에 강조된 입력칸을 채워 주세요." });
      return;
    }
    toast.success("프로젝트 생성됨");
  }

  return (
    <div className="validation-card">
      <label>
        프로젝트 이름
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="ui-layer-lab" />
      </label>
      <button className="command-trigger stable-wide" onClick={submit} type="button">생성</button>
    </div>
  );
}
