import { Command } from "cmdk";
import { useState } from "react";

const jobs = {
  "web-preview": ["install", "typecheck", "visual-smoke"],
  "api-preview": ["migrate", "unit-test", "deploy"]
};

export default function CommandNestedResourcePickerExample() {
  const [project, setProject] = useState<keyof typeof jobs>("web-preview");
  const [step, setStep] = useState("visual-smoke");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Pick project or step..." />
        <Command.List>
          <Command.Group heading="Projects">
            {Object.keys(jobs).map((item) => <Command.Item key={item} onSelect={() => setProject(item as keyof typeof jobs)}>{item}</Command.Item>)}
          </Command.Group>
          <Command.Group heading={`${project} steps`}>
            {jobs[project].map((item) => <Command.Item key={item} onSelect={() => setStep(item)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{project}</strong>
        <span>Selected step: {step}</span>
      </aside>
    </div>
  );
}
