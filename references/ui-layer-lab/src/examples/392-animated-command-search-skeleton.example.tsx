import { Command } from "cmdk";
import { useState } from "react";

export default function AnimatedCommandSearchSkeletonExample() {
  const [loading, setLoading] = useState(true);

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="Search remote actions..." />
      <Command.List>
        {loading ? (
          <div className="command-loading">Loading remote actions...</div>
        ) : (
          <Command.Group heading="Remote">
            <Command.Item>Open deploy log</Command.Item>
            <Command.Item>Retry visual smoke</Command.Item>
          </Command.Group>
        )}
      </Command.List>
      <button className="command-trigger" onClick={() => setLoading((value) => !value)}>
        {loading ? "Show Results" : "Show Loading"}
      </button>
    </Command>
  );
}
