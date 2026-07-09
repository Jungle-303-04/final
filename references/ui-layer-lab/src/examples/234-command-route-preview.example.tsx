import { Command } from "cmdk";
import { useState } from "react";

const routes = ["/runs", "/runs/failed", "/settings/ai", "/jobs/live"];

export default function CommandRoutePreviewExample() {
  const [route, setRoute] = useState("/runs");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Go to route..." />
        <Command.List>
          <Command.Group heading="Routes">
            {routes.map((item) => <Command.Item key={item} onSelect={() => setRoute(item)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>Route preview</strong>
        <span>{route}</span>
      </aside>
    </div>
  );
}
