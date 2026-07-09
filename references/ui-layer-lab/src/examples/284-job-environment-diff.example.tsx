import { useState } from "react";

const envs = {
  preview: {
    label: "미리보기",
    lines: ["API 주소=/미리보기", "캐시=예열"]
  },
  production: {
    label: "프로덕션",
    lines: ["API 주소=/프로덕션", "캐시=고온"]
  }
};

export default function JobEnvironmentDiffExample() {
  const [env, setEnv] = useState<keyof typeof envs>("preview");

  return (
    <div className="compare-panel">
      <select aria-label="비교할 환경 선택" value={env} onChange={(event) => setEnv(event.target.value as keyof typeof envs)}>
        {Object.entries(envs).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
      </select>
      <section>
        <strong>{envs[env].label}</strong>
        {envs[env].lines.map((line) => <code key={line}>{line}</code>)}
      </section>
    </div>
  );
}
