import { useState } from "react";

const gates = ["검토", "스테이징", "프로덕션"];

export default function JobDeploymentGatesExample() {
  const [approved, setApproved] = useState(["검토"]);

  return (
    <div className="stage-accordion">
      {gates.map((gate) => (
        <section key={gate}>
          <strong>{gate}</strong>
          <span>{approved.includes(gate) ? "승인됨" : "대기 중"}</span>
          <button onClick={() => setApproved((items) => [...new Set([...items, gate])])} type="button">승인</button>
        </section>
      ))}
    </div>
  );
}
