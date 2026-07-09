import { Command } from "cmdk";
import { useState } from "react";

const variables = ["{{run.id}}", "{{branch}}", "{{failed.step}}", "{{actor}}"];

export default function CommandVariableInsertExample() {
  const [prompt, setPrompt] = useState("Explain {{failed.step}} in ");

  return (
    <div className="attachment-card">
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Insert variable..." />
        <Command.List>
          <Command.Group heading="Variables">
            {variables.map((variable) => (
              <Command.Item key={variable} onSelect={() => setPrompt((value) => `${value}${variable}`)}>
                {variable}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
