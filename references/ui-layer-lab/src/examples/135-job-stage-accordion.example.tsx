import { useState } from "react";

const stages = [
  { name: "준비", logs: ["origin 가져오기", "의존성 설치"] },
  { name: "검증", logs: ["타입 검사", "단위 테스트"] },
  { name: "게시", logs: ["빌드", "아티팩트 업로드"] }
];

export default function JobStageAccordionExample() {
  const [open, setOpen] = useState("검증");

  return (
    <div className="stage-accordion">
      {stages.map((stage) => (
        <section key={stage.name}>
          <button onClick={() => setOpen(stage.name)} type="button">
            {stage.name}
          </button>
          {open === stage.name ? stage.logs.map((log) => <code key={log}>{log}</code>) : null}
        </section>
      ))}
    </div>
  );
}
