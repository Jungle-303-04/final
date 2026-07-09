import { Command } from "cmdk";
import { useState } from "react";

const files = ["App.tsx", "styles.css", "registry.ts", "workflow.yml"];

export default function CommandSelectionCountBarExample() {
  const [selected, setSelected] = useState(["App.tsx"]);

  function toggle(file: string) {
    setSelected((items) => (items.includes(file) ? items.filter((item) => item !== file) : [...items, file]));
  }

  return (
    <div className="command-filter-demo">
      <strong>{selected.length} files selected</strong>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Select files..." />
        <Command.List>
          <Command.Group heading="Files">
            {files.map((file) => (
              <Command.Item key={file} onSelect={() => toggle(file)}>
                <span>{file}</span>
                <kbd>{selected.includes(file) ? "on" : "off"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
