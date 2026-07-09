import { useState } from "react";
import { toast } from "sonner";

export default function SonnerAutosaveStatusExample() {
  const [text, setText] = useState("Draft note");
  const [saved, setSaved] = useState("Saved");

  function change(value: string) {
    setText(value);
    setSaved("Saving...");
    window.setTimeout(() => {
      setSaved("Saved just now");
      toast.success("Autosaved");
    }, 600);
  }

  return (
    <div className="attachment-card">
      <strong>{saved}</strong>
      <textarea value={text} onChange={(event) => change(event.target.value)} />
    </div>
  );
}
