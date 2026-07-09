import { Command } from "cmdk";
import { useState } from "react";

const initial = ["배포 실패 조사", "대상 프로필 검토", "실행 노트 업데이트"];

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
      <Command.Input value={search} onValueChange={setSearch} placeholder="작업을 검색하거나 만드세요" />
      <Command.List>
        {canCreate ? (
          <Command.Item onSelect={createTask}>
            <span>"{search}" 만들기</span>
            <kbd>새 항목</kbd>
          </Command.Item>
        ) : null}
        <Command.Group heading="작업">
          {filtered.map((task) => (
            <Command.Item key={task}>{task}</Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
