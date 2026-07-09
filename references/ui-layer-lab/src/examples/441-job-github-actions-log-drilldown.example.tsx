import { useState } from "react";

const levels = {
  워크플로: ["빌드와 검사"],
  작업: ["프론트엔드", "백엔드"],
  단계: ["설치", "타입 검사", "시각 검사"],
  로그: ["L12 npm ci", "L44 tsc -b", "L78 스크린샷 차이"]
};

export default function JobGithubActionsLogDrilldownExample() {
  const [level, setLevel] = useState<keyof typeof levels>("워크플로");
  const [item, setItem] = useState(levels.워크플로[0]);

  function choose(nextLevel: keyof typeof levels) {
    setLevel(nextLevel);
    setItem(levels[nextLevel][0]);
  }

  return (
    <div className="drill-grid two">
      <div className="drawer">
        {Object.keys(levels).map((name) => <button className="row-button" key={name} onClick={() => choose(name as keyof typeof levels)} type="button">{name}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>{level} / {item}</strong>
        <span>워크플로에서 작업, 단계, 로그까지 좁혀 봅니다.</span>
      </aside>
    </div>
  );
}
