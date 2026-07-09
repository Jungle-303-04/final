import { useState } from "react";

const schema = {
  run: {
    label: "실행",
    fields: ["ID", "상태", "시작 시각"]
  },
  job: {
    label: "작업",
    fields: ["ID", "러너", "소요 시간"]
  },
  step: {
    label: "단계",
    fields: ["이름", "종료 코드", "로그 URL"]
  }
};

export default function DrilldownSchemaFieldsExample() {
  const [table, setTable] = useState<keyof typeof schema>("run");
  const [selectedField, setSelectedField] = useState(schema.run.fields[0]);
  const selected = schema[table];

  function selectTable(nextTable: keyof typeof schema) {
    setTable(nextTable);
    setSelectedField(schema[nextTable].fields[0]);
  }

  return (
    <div className="column-browser">
      <div>
        {Object.entries(schema).map(([item, value]) => (
          <button
            aria-pressed={table === item}
            className={table === item ? "active" : ""}
            key={item}
            onClick={() => selectTable(item as keyof typeof schema)}
            type="button"
          >
            {value.label}
          </button>
        ))}
      </div>
      <div>
        {selected.fields.map((fieldName) => (
          <button
            aria-label={`${selected.label} 테이블의 ${fieldName} 필드 선택`}
            aria-pressed={selectedField === fieldName}
            className={selectedField === fieldName ? "active" : ""}
            key={fieldName}
            onClick={() => setSelectedField(fieldName)}
            type="button"
          >
            {fieldName}
          </button>
        ))}
      </div>
      <div>
        <strong>{selected.label}</strong>
        <span aria-live="polite">{selectedField} 필드 선택됨 · {selected.fields.length}개 필드</span>
      </div>
    </div>
  );
}
