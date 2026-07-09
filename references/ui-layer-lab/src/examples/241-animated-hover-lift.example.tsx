import { useState } from "react";

export default function AnimatedHoverLiftExample() {
  const [active, setActive] = useState(false);

  return (
    <button
      aria-label="마우스 올림 미리보기 카드"
      className={active ? "hover-lift-card active" : "hover-lift-card"}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      type="button"
    >
      <strong>마우스 올림 미리보기</strong>
      <span>{active ? "떠오름" : "대기"}</span>
    </button>
  );
}
