import { useState } from "react";

const gates = ["review", "staging", "production"];

export default function JobDeploymentGatesExample() {
  const [approved, setApproved] = useState(["review"]);

  return (
    <div className="stage-accordion">
      {gates.map((gate) => (
        <section key={gate}>
          <strong>{gate}</strong>
          <span>{approved.includes(gate) ? "approved" : "waiting"}</span>
          <button onClick={() => setApproved((items) => [...new Set([...items, gate])])}>Approve</button>
        </section>
      ))}
    </div>
  );
}
