import { Command } from "cmdk";
import { useState } from "react";

const actions = [
  { name: "실패 실행 열기", scope: "워크플로", score: 96 },
  { name: "선택한 차이 설명", scope: "AI", score: 88 },
  { name: "불안정 샤드 재시도", scope: "작업", score: 74 }
];

export default function CommandRankedActionsExample() {
  const [active, setActive] = useState(actions[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="순위 액션 검색..." />
        <Command.List>
          <Command.Group heading="추천 액션">
            {actions.map((action) => (
              <Command.Item aria-selected={active.name === action.name} key={action.name} onSelect={() => setActive(action)} value={action.name}>
                <span>{action.name}</span>
                <kbd>{action.score}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside aria-live="polite" className="detail-panel">
        <strong>{active.name}</strong>
        <span>{active.scope} 추천 점수</span>
        <div className="progress-track"><div style={{ width: `${active.score}%` }} /></div>
      </aside>
    </div>
  );
}
