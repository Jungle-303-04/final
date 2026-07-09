import { Command } from "cmdk";
import { useState } from "react";

export default function CommandErrorStateExample() {
  const [error, setError] = useState(false);

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="Search remote actions..." onValueChange={(value) => setError(value.length > 4)} />
      <Command.List>
        {error ? (
          <div className="command-error">Remote search failed. Try again.</div>
        ) : (
          <Command.Group heading="Local">
            <Command.Item>Open logs</Command.Item>
            <Command.Item>Run build</Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}
