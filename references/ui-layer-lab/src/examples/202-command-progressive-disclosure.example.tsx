import { Command } from "cmdk";
import { useState } from "react";

export default function CommandProgressiveDisclosureExample() {
  const [advanced, setAdvanced] = useState(false);

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="Search actions..." />
      <Command.List>
        <Command.Group heading="Common">
          <Command.Item>Open logs</Command.Item>
          <Command.Item>Explain failure</Command.Item>
          <Command.Item onSelect={() => setAdvanced((value) => !value)}>
            <span>{advanced ? "Hide" : "Show"} advanced commands</span>
            <kbd>⌘.</kbd>
          </Command.Item>
        </Command.Group>
        {advanced ? (
          <Command.Group heading="Advanced">
            <Command.Item>Reset cache</Command.Item>
            <Command.Item>Force rebuild</Command.Item>
          </Command.Group>
        ) : null}
      </Command.List>
    </Command>
  );
}
