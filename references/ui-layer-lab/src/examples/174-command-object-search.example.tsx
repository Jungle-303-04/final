import { Command } from "cmdk";
import { useState } from "react";

const records = [
  { id: "run-411", title: "미리보기 배포", owner: "민아", status: "실패" },
  { id: "run-412", title: "단위 검사", owner: "준", status: "통과" },
  { id: "run-413", title: "시각 회귀 검사", owner: "아라", status: "진행" }
];

export default function CommandObjectSearchExample() {
  const [selected, setSelected] = useState(records[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="구조화된 실행 기록 검색..." />
        <Command.List>
          <Command.Group heading="실행 기록">
            {records.map((record) => (
              <Command.Item key={record.id} onSelect={() => setSelected(record)}>
                <span>{record.title}</span>
                <kbd>{record.status}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{selected.id}</strong>
        <span>{selected.title}</span>
        <span>담당자: {selected.owner}</span>
        <span>상태: {selected.status}</span>
      </aside>
    </div>
  );
}
