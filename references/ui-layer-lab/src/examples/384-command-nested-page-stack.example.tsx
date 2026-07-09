import { Command } from "cmdk";
import { useState } from "react";

const pages = {
  Root: ["Views", "Actions"],
  Views: ["Runs", "Logs", "Artifacts"],
  Actions: ["Retry", "Cancel", "Promote"]
};

export default function CommandNestedPageStackExample() {
  const [page, setPage] = useState<keyof typeof pages>("Root");
  const [selected, setSelected] = useState("No action selected");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <div className="command-breadcrumb">
          {page === "Root" ? <span>Root</span> : <button onClick={() => setPage("Root")}>Root</button>}
          <span>/ {page}</span>
        </div>
        <Command.Input placeholder="Move command pages..." />
        <Command.List>
          <Command.Group heading={page}>
            {pages[page].map((item) => (
              <Command.Item
                key={item}
                onSelect={() => (item in pages ? setPage(item as keyof typeof pages) : setSelected(item))}
                value={item}
              >
                {item}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{selected}</strong>
        <span>Nested command page stack</span>
      </aside>
    </div>
  );
}
