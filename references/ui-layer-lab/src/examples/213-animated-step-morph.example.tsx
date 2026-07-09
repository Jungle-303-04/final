import { useState } from "react";

const states = ["대기", "실행 중", "완료"];

export default function AnimatedStepMorphExample() {
  const [index, setIndex] = useState(0);

  return (
    <div className="morph-card">
      <button className="command-trigger stable-wide" onClick={() => setIndex((value) => (value + 1) % states.length)} type="button">다음 상태</button>
      <div className={`morph-box state-${index}`}>
        <strong>{states[index]}</strong>
      </div>
    </div>
  );
}
