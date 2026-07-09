import { Command } from "cmdk";
import { useState } from "react";

const jobs = {
  "web-preview": {
    label: "웹 미리보기",
    steps: [
      { label: "설치", value: "install" },
      { label: "타입 검사", value: "typecheck" },
      { label: "시각 스모크", value: "visual-smoke" }
    ]
  },
  "api-preview": {
    label: "API 미리보기",
    steps: [
      { label: "마이그레이션", value: "migrate" },
      { label: "단위 검사", value: "unit-test" },
      { label: "배포", value: "deploy" }
    ]
  }
};

export default function CommandNestedResourcePickerExample() {
  const [project, setProject] = useState<keyof typeof jobs>("web-preview");
  const [step, setStep] = useState("visual-smoke");
  const selectedProject = jobs[project];
  const selectedStep = selectedProject.steps.find((item) => item.value === step) ?? selectedProject.steps[0];

  function selectProject(next: keyof typeof jobs) {
    setProject(next);
    setStep(jobs[next].steps[0].value);
  }

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="프로젝트나 단계를 선택하세요..." />
        <Command.List>
          <Command.Group heading="프로젝트">
            {Object.entries(jobs).map(([item, value]) => <Command.Item aria-selected={project === item} key={item} onSelect={() => selectProject(item as keyof typeof jobs)} value={value.label}>{value.label}</Command.Item>)}
          </Command.Group>
          <Command.Group heading={`${selectedProject.label} 단계`}>
            {selectedProject.steps.map((item) => <Command.Item aria-selected={step === item.value} key={item.value} onSelect={() => setStep(item.value)} value={item.label}>{item.label}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside aria-live="polite" className="detail-panel">
        <strong>{selectedProject.label}</strong>
        <span>선택한 단계: {selectedStep.label}</span>
      </aside>
    </div>
  );
}
