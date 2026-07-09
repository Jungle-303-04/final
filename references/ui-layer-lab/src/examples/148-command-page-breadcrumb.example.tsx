import { Command } from "cmdk";
import { useState } from "react";

const pages = {
  root: ["Jobs", "Files", "AI"],
  Jobs: ["Failed runs", "Running jobs", "Queue"],
  Files: ["Changed files", "Config files"],
  AI: ["Explain", "Fix", "Summarize"]
};

export default function CommandPageBreadcrumbExample() {
  const [page, setPage] = useState<keyof typeof pages>("root");

  return (
    <Command className="command-dialog inline-command">
      <div className="command-breadcrumb">
        <button onClick={() => setPage("root")}>root</button>
        {page !== "root" ? <span>/ {page}</span> : null}
      </div>
      <Command.Input placeholder="Search page..." />
      <Command.List>
        <Command.Group heading={page}>
          {pages[page].map((item) => (
            <Command.Item key={item} onSelect={() => item in pages && setPage(item as keyof typeof pages)}>
              {item}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
