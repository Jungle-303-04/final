import { useState } from "react";

const relations = {
  run: ["job", "artifact", "actor"],
  job: ["step", "runner", "log"],
  artifact: ["report.html", "screenshot.png"]
};

export default function DrilldownRelatedEntitiesExample() {
  const [entity, setEntity] = useState<keyof typeof relations>("run");

  return (
    <div className="column-browser">
      <div>{Object.keys(relations).map((item) => <button className={entity === item ? "active" : ""} key={item} onClick={() => setEntity(item as keyof typeof relations)}>{item}</button>)}</div>
      <div>{relations[entity].map((item) => <button key={item}>{item}</button>)}</div>
      <div><strong>{relations[entity].length} related</strong></div>
    </div>
  );
}
