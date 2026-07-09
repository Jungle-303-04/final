import { useState } from "react";
import { toast } from "sonner";

export default function SonnerReleaseNotePublishedExample() {
  const [published, setPublished] = useState(false);

  function publish() {
    setPublished(true);
    toast.success("Release note published", { description: "Linked to deploy-preview-42." });
  }

  return (
    <div className="toast-state-card">
      <strong>{published ? "Published" : "Draft"}</strong>
      <button className="command-trigger" onClick={publish}>Publish Note</button>
    </div>
  );
}
