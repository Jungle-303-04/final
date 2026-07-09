import { useMemo, useState } from "react";
const run = {
  jobs: [
    {
      id: "build",
      name: "프론트엔드 빌드",
      steps: [
        { id: "checkout", name: "소스 확인", status: "성공", logs: ["브랜치 확인 완료"] },
        { id: "bundle", name: "번들 생성", status: "성공", logs: ["vite build 완료"] }
      ]
    },
    {
      id: "checks",
      name: "품질 검사",
      steps: [
        { id: "typecheck", name: "타입 검사", status: "성공", logs: ["tsc 통과"] },
        { id: "visual", name: "시각 검사", status: "실패", logs: ["경로 /dev/ui-layer-lab 확인 실패"] }
      ]
    }
  ]
};

export default function WorkflowDrilldownExample() {
  const [jobId, setJobId] = useState("checks");
  const [stepId, setStepId] = useState("visual");
  const job = useMemo(() => run.jobs.find((item) => item.id === jobId) ?? run.jobs[0], [jobId]);
  const step = useMemo(() => job.steps.find((item) => item.id === stepId) ?? job.steps[0], [job, stepId]);

  return (
    <div className="drill-grid">
      <div>
        <h3>작업</h3>
        {run.jobs.map((item) => (
          <button
            className={item.id === job.id ? "selected row-button" : "row-button"}
            key={item.id}
            onClick={() => {
              setJobId(item.id);
              setStepId(item.steps[0].id);
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div>
        <h3>단계</h3>
        {job.steps.map((item) => (
          <button
            className={item.id === step.id ? "selected row-button" : "row-button"}
            key={item.id}
            onClick={() => setStepId(item.id)}
          >
            {item.name} · {item.status}
          </button>
        ))}
      </div>
      <pre className="terminal-log">
        {step.logs.map((line) => (
          <code key={line}>{line}</code>
        ))}
      </pre>
    </div>
  );
}
