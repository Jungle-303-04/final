import { useState } from "react";

const scopes = {
  Admin: ["secrets", "deployments", "billing"],
  Member: ["deployments", "logs"],
  Guest: ["logs"]
};

export default function DrilldownPermissionScopeExample() {
  const [scope, setScope] = useState<keyof typeof scopes>("Member");

  return (
    <div className="drill-grid">
      <div className="drawer">
        {Object.keys(scopes).map((item) => <button className="row-button" key={item} onClick={() => setScope(item as keyof typeof scopes)}>{item}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>{scope}</strong>
        {scopes[scope].map((item) => <span key={item}>{item}</span>)}
      </aside>
    </div>
  );
}
