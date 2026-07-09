import { Command } from "cmdk";
import { useState } from "react";

const jobs = ["Run typecheck", "Build frontend", "Deploy preview"];

export default function JobCommandPaletteLaunchExample() {
  const [job, setJob] = useState("No job launched");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Launch a job..." />
        <Command.List>
          <Command.Group heading="Jobs">
            {jobs.map((item) => <Command.Item key={item} onSelect={() => setJob(`${item} queued`)} value={item}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{job}</strong>
        <span>Command selection starts a background job</span>
      </aside>
    </div>
  );
}
