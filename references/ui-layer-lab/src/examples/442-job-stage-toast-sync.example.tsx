import { toast } from "sonner";
import { useState } from "react";

const stages = ["대기", "실행 중", "검증 중", "완료"];

export default function JobStageToastSyncExample() {
  const [index, setIndex] = useState(0);

  function advance() {
    const next = (index + 1) % stages.length;
    setIndex(next);
    toast.info(`작업 상태: ${stages[next]}`);
  }

  return (
    <div className="checkpoint-card">
      <button className="command-trigger stable-wide" onClick={advance} type="button">작업 진행</button>
      <div className="checkpoint-row">
        {stages.map((stage, stageIndex) => <span className={stageIndex <= index ? "active" : ""} key={stage}>{stage}</span>)}
      </div>
    </div>
  );
}
