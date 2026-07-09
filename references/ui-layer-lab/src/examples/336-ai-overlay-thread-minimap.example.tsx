import { useState } from "react";

const threads = ["Plan", "Patch", "Verify"];

export default function AiOverlayThreadMinimapExample() {
  const [thread, setThread] = useState("Patch");

  return (
    <div className="thread-minimap">
      <aside>
        {threads.map((item) => <button className={thread === item ? "active" : ""} key={item} onClick={() => setThread(item)}>{item}</button>)}
      </aside>
      <section>
        <strong>{thread} thread</strong>
        <span>Overlay conversation stays anchored above the current UI.</span>
      </section>
    </div>
  );
}
