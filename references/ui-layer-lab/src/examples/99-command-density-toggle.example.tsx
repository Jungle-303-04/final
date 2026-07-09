import { Command } from "cmdk";
import { useState } from "react";

const actions = ["Open file", "Run check", "Summarize logs", "Create note", "Deploy preview"];

export default function CommandDensityToggleExample() {
  const [dense, setDense] = useState(false);

  return (
    <div className="command-filter-demo">
      <button className="command-trigger" onClick={() => setDense((value) => !value)}>
        {dense ? "Comfortable" : "Dense"}
      </button>
      <Command className={`command-dialog inline-command ${dense ? "dense-command" : ""}`}>
        <Command.Input placeholder="Search actions..." />
        <Command.List>
          <Command.Group heading={dense ? "Dense" : "Comfortable"}>
            {actions.map((action) => (
              <Command.Item key={action}>{action}</Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
