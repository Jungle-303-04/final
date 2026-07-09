import { useState } from "react";

const schema = {
  run: ["id", "status", "startedAt"],
  job: ["id", "runner", "duration"],
  step: ["name", "exitCode", "logUrl"]
};

export default function DrilldownSchemaFieldsExample() {
  const [table, setTable] = useState<keyof typeof schema>("run");

  return (
    <div className="column-browser">
      <div>{Object.keys(schema).map((item) => <button className={table === item ? "active" : ""} key={item} onClick={() => setTable(item as keyof typeof schema)}>{item}</button>)}</div>
      <div>{schema[table].map((field) => <button key={field}>{field}</button>)}</div>
      <div><strong>{table}</strong><span>{schema[table].length} fields</span></div>
    </div>
  );
}
