import { useState } from "react";

export default function ComponentSelectEnvironmentExample() {
  const [env, setEnv] = useState("staging");

  return (
    <section className="component-demo">
      <header>
        <strong>환경 선택</strong>
        <span>작업 대상 환경을 명시적으로 고정</span>
      </header>
      <label className="component-field">
        <span>대상 환경</span>
        <select value={env} onChange={(event) => setEnv(event.target.value)}>
          <option value="local">local</option>
          <option value="staging">staging</option>
          <option value="production">production</option>
        </select>
      </label>
      <p className="component-muted">선택된 환경: {env}</p>
    </section>
  );
}
