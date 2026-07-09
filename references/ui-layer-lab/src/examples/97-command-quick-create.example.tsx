import { Command } from "cmdk";
import { useState } from "react";

const initial = ["Investigate deploy failure", "Review target profile", "Update run note"];

export default function CommandQuickCreateExample() {
  const [tasks, setTasks] = useState(initial);
  const [search, setSearch] = useState("");

  const filtered = tasks.filter((task) => task.toLowerCase().includes(search.toLowerCase()));
  const canCreate = search.trim().length > 0 && !tasks.some((task) => task.toLowerCase() === search.toLowerCase());

  function createTask() {
    setTasks((items) => [search, ...items]);
    setSearch("");
  }

  return (
    <Command shouldFilter={false} className="command-dialog inline-command">
      <Command.Input value={search} onValueChange={setSearch} placeholder="Search or create task..." />
      <Command.List>
        {canCreate ? (
          <Command.Item onSelect={createTask}>
            <span>Create "{search}"</span>
            <kbd>new</kbd>
          </Command.Item>
        ) : null}
        <Command.Group heading="Tasks">
          {filtered.map((task) => (
            <Command.Item key={task}>{task}</Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
