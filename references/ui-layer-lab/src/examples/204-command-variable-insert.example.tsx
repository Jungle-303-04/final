import { Command } from "cmdk";
import { useState } from "react";

const variables = ["{{실행.id}}", "{{브랜치}}", "{{실패.단계}}", "{{실행자}}"];

export default function CommandVariableInsertExample() {
  const [prompt, setPrompt] = useState("{{실패.단계}} 실패 원인을 설명하고 ");

  return (
    <div className="attachment-card">
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="변수 삽입..." />
        <Command.List>
          <Command.Group heading="변수">
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
