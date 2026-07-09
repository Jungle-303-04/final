import { useState } from "react";

export default function AnimatedResizePanelExample() {
  const [wide, setWide] = useState(false);

  return (
    <div className="resize-panel-demo">
      <button className="command-trigger" onClick={() => setWide((value) => !value)}>
        Toggle Panel
      </button>
      <section className={wide ? "wide" : ""}>
        <strong>{wide ? "Expanded context" : "Compact context"}</strong>
        <span>Panel width and content density animate together.</span>
      </section>
    </div>
  );
}
