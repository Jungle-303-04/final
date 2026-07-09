import { useState } from "react";

const relations = {
  run: {
    label: "실행",
    items: [
      { label: "작업", value: "job" },
      { label: "아티팩트", value: "artifact" },
      { label: "실행자", value: "actor" }
    ]
  },
  job: {
    label: "작업",
    items: [
      { label: "단계", value: "step" },
      { label: "러너", value: "runner" },
      { label: "로그", value: "log" }
    ]
  },
  artifact: {
    label: "아티팩트",
    items: [
      { label: "보고서", value: "report.html" },
      { label: "스크린샷", value: "screenshot.png" }
    ]
  }
};

export default function DrilldownRelatedEntitiesExample() {
  const [entity, setEntity] = useState<keyof typeof relations>("run");
  const [related, setRelated] = useState(relations.run.items[0].value);
  const selected = relations[entity];

  function selectEntity(next: keyof typeof relations) {
    setEntity(next);
    setRelated(relations[next].items[0].value);
  }

  return (
    <div className="column-browser">
      <div>
        {Object.entries(relations).map(([item, value]) => (
          <button aria-pressed={entity === item} className={entity === item ? "active" : ""} key={item} onClick={() => selectEntity(item as keyof typeof relations)} type="button">
            {value.label}
          </button>
        ))}
      </div>
      <div>
        {selected.items.map((item) => (
          <button aria-label={`${selected.label} 관련 ${item.label} 선택`} aria-pressed={related === item.value} className={related === item.value ? "active" : ""} key={item.value} onClick={() => setRelated(item.value)} type="button">
            {item.label}
          </button>
        ))}
      </div>
      <div><strong>관련 항목 {selected.items.length}개</strong><span aria-live="polite">선택: {selected.items.find((item) => item.value === related)?.label}</span></div>
    </div>
  );
}
