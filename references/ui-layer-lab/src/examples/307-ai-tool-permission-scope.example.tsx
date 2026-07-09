import { useState } from "react";

const scopes = ["read files", "run tests", "write patch", "push branch"];

export default function AiToolPermissionScopeExample() {
  const [allowed, setAllowed] = useState(["read files", "run tests"]);

  function toggle(scope: string) {
    setAllowed((items) => (items.includes(scope) ? items.filter((item) => item !== scope) : [...items, scope]));
  }

  return (
    <div className="scope-grid">
      {scopes.map((scope) => <button className={allowed.includes(scope) ? "active" : ""} key={scope} onClick={() => toggle(scope)}>{scope}</button>)}
      <strong>{allowed.length} scopes allowed</strong>
    </div>
  );
}
