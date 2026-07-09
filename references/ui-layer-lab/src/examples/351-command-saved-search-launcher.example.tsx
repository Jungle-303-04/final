import { Command } from "cmdk";
import { useState } from "react";

const searches = ["failed visual jobs", "my pending reviews", "production deploys"];

export default function CommandSavedSearchLauncherExample() {
  const [search, setSearch] = useState(searches[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Launch saved search..." />
        <Command.List>
          <Command.Group heading="Saved searches">
            {searches.map((item) => <Command.Item key={item} onSelect={() => setSearch(item)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{search}</strong>
        <span>Saved search opened</span>
      </aside>
    </div>
  );
}
