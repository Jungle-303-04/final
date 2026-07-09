import { Command } from "cmdk";
import { useState } from "react";

const environments = [
  { value: "local", label: "로컬" },
  { value: "preview", label: "미리보기" },
  { value: "staging", label: "스테이징" },
  { value: "production", label: "프로덕션" }
];

export default function CommandEnvironmentSwitcherExample() {
  const [environment, setEnvironment] = useState("preview");
  const activeEnvironment = environments.find((item) => item.value === environment) ?? environments[0];

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="환경 전환..." />
        <Command.List>
          <Command.Group heading="환경">
            {environments.map((item) => (
              <Command.Item key={item.value} onSelect={() => setEnvironment(item.value)} value={item.value}>
                <span>{item.label}</span>
                <kbd>{item.value === environment ? "현재" : "이동"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{activeEnvironment.label}</strong>
        <span>활성 컨텍스트: {activeEnvironment.value}</span>
      </aside>
    </div>
  );
}
