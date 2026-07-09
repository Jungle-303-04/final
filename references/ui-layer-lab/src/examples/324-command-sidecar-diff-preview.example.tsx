import { Command } from "cmdk";
import { useState } from "react";

const hunks = {
  "App.tsx": "+ render ExampleSection",
  "styles.css": "+ overflow-wrap anywhere",
  "registry.ts": "+ add description"
};

export default function CommandSidecarDiffPreviewExample() {
  const [file, setFile] = useState<keyof typeof hunks>("App.tsx");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Preview diff hunk..." />
        <Command.List>
          <Command.Group heading="Changed files">
            {Object.keys(hunks).map((item) => <Command.Item key={item} onSelect={() => setFile(item as keyof typeof hunks)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{file}</strong>
        <code>{hunks[file]}</code>
      </aside>
    </div>
  );
}
