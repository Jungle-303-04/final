import { useState } from "react";

export default function DrilldownColumnResizableExample() {
  const [wide, setWide] = useState(false);

  return (
    <div className={wide ? "split-resize wide" : "split-resize"}>
      <section>
        <strong>Runs</strong>
        <button className="row-button">deploy-preview</button>
        <button className="row-button">nightly-smoke</button>
      </section>
      <section>
        <strong>Details</strong>
        <span>Resize the detail column before drilling deeper.</span>
        <button className="command-trigger" onClick={() => setWide((value) => !value)}>Resize Columns</button>
      </section>
    </div>
  );
}
