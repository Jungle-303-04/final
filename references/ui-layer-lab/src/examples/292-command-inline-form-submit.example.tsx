import { Command } from "cmdk";
import { useState } from "react";

const actions = ["Create branch", "Open pull request", "Draft release note"];

export default function CommandInlineFormSubmitExample() {
  const [action, setAction] = useState(actions[0]);
  const [name, setName] = useState("woonyong/ui-layer-lab");
  const [submitted, setSubmitted] = useState("Ready");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Choose action..." />
        <Command.List>
          <Command.Group heading="Actions">
            {actions.map((item) => <Command.Item key={item} onSelect={() => setAction(item)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{action}</strong>
        <input className="search-input" value={name} onChange={(event) => setName(event.target.value)} />
        <button className="command-trigger" onClick={() => setSubmitted(`${action}: ${name}`)}>Submit</button>
        <span>{submitted}</span>
      </aside>
    </div>
  );
}
