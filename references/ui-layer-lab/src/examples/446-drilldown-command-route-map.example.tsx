import { Command } from "cmdk";
import { useState } from "react";

const routes = ["워크플로/빌드", "작업/프론트엔드", "단계/타입 검사", "로그/L44"];

export default function DrilldownCommandRouteMapExample() {
  const [route, setRoute] = useState(routes[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="이동할 경로 검색" />
        <Command.List>
          <Command.Group heading="드릴다운 경로">
            {routes.map((item) => <Command.Item key={item} onSelect={() => setRoute(item)} value={item}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{route}</strong>
        <span>선택한 경로가 상세 패널과 연결됩니다.</span>
      </aside>
    </div>
  );
}
