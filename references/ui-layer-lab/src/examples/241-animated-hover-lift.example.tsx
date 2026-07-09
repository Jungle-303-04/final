import { useState } from "react";

export default function AnimatedHoverLiftExample() {
  const [active, setActive] = useState(false);

  return (
    <button className={active ? "hover-lift-card active" : "hover-lift-card"} onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)}>
      <strong>Hover preview</strong>
      <span>{active ? "Lifted" : "Resting"}</span>
    </button>
  );
}
