import { useState } from "react";

const stages = [
  { name: "Prepare", logs: ["fetch origin", "install dependencies"] },
  { name: "Validate", logs: ["typecheck", "unit test"] },
  { name: "Publish", logs: ["build", "upload artifact"] }
];

export default function JobStageAccordionExample() {
  const [open, setOpen] = useState("Validate");

  return (
    <div className="stage-accordion">
      {stages.map((stage) => (
        <section key={stage.name}>
          <button onClick={() => setOpen(stage.name)}>{stage.name}</button>
          {open === stage.name ? stage.logs.map((log) => <code key={log}>{log}</code>) : null}
        </section>
      ))}
    </div>
  );
}
