import { Command } from "cmdk";
import { useState } from "react";

export default function CommandPagesExample() {
  const [page, setPage] = useState<"root" | "ai" | "git">("root");

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder={page === "root" ? "Search actions..." : "Search page actions..."} />
      <Command.List>
        {page !== "root" ? (
          <Command.Item onSelect={() => setPage("root")}>← Back</Command.Item>
        ) : null}

        {page === "root" ? (
          <Command.Group heading="Pages">
            <Command.Item onSelect={() => setPage("ai")}>AI Actions →</Command.Item>
            <Command.Item onSelect={() => setPage("git")}>Git Actions →</Command.Item>
          </Command.Group>
        ) : null}

        {page === "ai" ? (
          <Command.Group heading="AI Actions">
            <Command.Item>Ask about current screen</Command.Item>
            <Command.Item>Summarize selected logs</Command.Item>
            <Command.Item>Explain failure</Command.Item>
          </Command.Group>
        ) : null}

        {page === "git" ? (
          <Command.Group heading="Git Actions">
            <Command.Item>Pull latest</Command.Item>
            <Command.Item>Push branch</Command.Item>
            <Command.Item>Open diff</Command.Item>
          </Command.Group>
        ) : null}
      </Command.List>
    </Command>
  );
}
