import { useState } from "react";

export default function ComponentFieldValidationExample() {
  const [value, setValue] = useState("npm run");
  const valid = value.trim().split(" ").length >= 3;

  return (
    <section className="component-demo">
      <header>
        <strong>필드 검증</strong>
        <span>입력, 설명, 오류 메시지를 한 묶음으로 배치</span>
      </header>
      <label className="component-field">
        <span>실행 명령</span>
        <input value={value} onChange={(event) => setValue(event.target.value)} />
        <small className={valid ? "ok" : "error"}>{valid ? "실행 가능한 명령입니다." : "명령과 스크립트 이름을 함께 입력하세요."}</small>
      </label>
    </section>
  );
}
