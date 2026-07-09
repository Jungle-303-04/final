import { useState } from "react";

export default function AiSelectionToolbarExample() {
  const [selected, setSelected] = useState(false);
  const [result, setResult] = useState("Select text to ask AI.");

  return (
    <div className="selection-demo">
      <p onMouseUp={() => setSelected(true)}>The visual smoke job failed because the preview route returned 404.</p>
      {selected ? (
        <div className="selection-toolbar">
          <button onClick={() => setResult("AI: Missing route is the likely cause.")}>Explain</button>
          <button onClick={() => setResult("AI: Restore /preview or update the test.")}>Fix</button>
        </div>
      ) : null}
      <span>{result}</span>
    </div>
  );
}
