import { useState } from "react";

const scopes = ["파일 읽기", "테스트 실행", "패치 작성", "브랜치 푸시"];

export default function AiToolPermissionScopeExample() {
  const [allowed, setAllowed] = useState(["파일 읽기", "테스트 실행"]);

  function toggle(scope: string) {
    setAllowed((items) => (items.includes(scope) ? items.filter((item) => item !== scope) : [...items, scope]));
  }

  return (
    <div className="scope-grid">
      {scopes.map((scope) => <button className={allowed.includes(scope) ? "active" : ""} key={scope} onClick={() => toggle(scope)} type="button">{scope}</button>)}
      <strong>허용된 범위 {allowed.length}개</strong>
    </div>
  );
}
