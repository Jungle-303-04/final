import { Command } from "cmdk";
import { useState } from "react";

const files = ["App.tsx", "registry.ts", "styles.css", "workflow.yaml", "README.md"];

export default function CommandMultiSelectExample() {
  const [selected, setSelected] = useState(["App.tsx"]);

  function toggle(file: string) {
    setSelected((items) => (items.includes(file) ? items.filter((item) => item !== file) : [...items, file]));
  }

  return (
    <div className="command-filter-demo">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Select files for AI context..." />
        <Command.List>
          <Command.Group heading="Files">
            {files.map((file) => (
              <Command.Item key={file} onSelect={() => toggle(file)}>
                <span>{file}</span>
                <kbd>{selected.includes(file) ? "selected" : "add"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <span className="muted">{selected.length} files selected</span>
    </div>
  );
}
