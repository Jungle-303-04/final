import { useState } from "react";

export default function AnimatedResizableSplitViewExample() {
  const [wide, setWide] = useState(false);

  return (
    <div className={wide ? "split-resize wide" : "split-resize"}>
      <section>Editor</section>
      <section>Preview</section>
      <button className="command-trigger" onClick={() => setWide((value) => !value)}>Resize</button>
    </div>
  );
}
