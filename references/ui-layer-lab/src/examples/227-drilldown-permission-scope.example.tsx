import { useState } from "react";

const scopes = {
  관리자: ["시크릿", "배포", "결제"],
  멤버: ["배포", "로그"],
  게스트: ["로그"]
};

export default function DrilldownPermissionScopeExample() {
  const [scope, setScope] = useState<keyof typeof scopes>("멤버");

  return (
    <div className="drill-grid">
      <div className="drawer">
        {Object.keys(scopes).map((item) => <button aria-pressed={scope === item} className="row-button" key={item} onClick={() => setScope(item as keyof typeof scopes)} type="button">{item}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>{scope}</strong>
        {scopes[scope].map((item) => <span key={item}>{item}</span>)}
      </aside>
    </div>
  );
}
