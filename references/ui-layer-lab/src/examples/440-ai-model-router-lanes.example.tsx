import { useState } from "react";

const lanes = ["빠른 응답", "균형", "심층 분석"];

export default function AiModelRouterLanesExample() {
  const [lane, setLane] = useState("균형");

  return (
    <div className="parallel-lanes">
      {lanes.map((item) => (
        <section className={lane === item ? "active" : ""} key={item} onClick={() => setLane(item)}>
          <strong>{item}</strong>
          <span>{lane === item ? "선택된 경로" : "사용 가능"}</span>
        </section>
      ))}
    </div>
  );
}
