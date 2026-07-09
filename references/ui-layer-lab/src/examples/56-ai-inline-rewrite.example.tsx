import { useState } from "react";

const variants = {
  shorter: "Route smoke failed after /preview was removed.",
  clearer: "The preview route is missing, so the visual smoke test cannot open the page.",
  action: "Restore /preview or update the smoke test target before rerunning CI."
};

export default function AiInlineRewriteExample() {
  const [text, setText] = useState("The test failed because the app changed and the browser could not find the page.");

  return (
    <div className="rewrite-card">
      <textarea value={text} onChange={(event) => setText(event.target.value)} />
      <div className="segmented-row">
        {Object.entries(variants).map(([label, value]) => (
          <button key={label} onClick={() => setText(value)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
