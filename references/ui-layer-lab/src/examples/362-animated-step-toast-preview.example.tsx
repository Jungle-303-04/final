import { useState } from "react";

const previews = ["queued toast", "running toast", "success toast"];

export default function AnimatedStepToastPreviewExample() {
  const [index, setIndex] = useState(0);

  return (
    <div className="toast-preview-stage">
      <button className="command-trigger" onClick={() => setIndex((value) => (value + 1) % previews.length)}>Next Toast</button>
      <section key={previews[index]}>{previews[index]}</section>
    </div>
  );
}
