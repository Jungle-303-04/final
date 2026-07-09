import { Command } from "cmdk";
import { useState } from "react";

const routes = ["/실행", "/실행/실패", "/설정/ai", "/작업/실시간"];

export default function CommandRoutePreviewExample() {
  const [route, setRoute] = useState("/실행");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="이동할 경로 검색..." />
        <Command.List>
          <Command.Group heading="경로">
            {routes.map((item) => <Command.Item key={item} onSelect={() => setRoute(item)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>경로 미리보기</strong>
        <span>{route}</span>
      </aside>
    </div>
  );
}
