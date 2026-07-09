import { toast } from "sonner";

const events = ["Pull started", "Install complete", "Typecheck running"];

export default function SonnerBatchEventsExample() {
  function showBatch() {
    events.forEach((event, index) => {
      window.setTimeout(() => toast(event), index * 300);
    });
  }

  return (
    <button className="command-trigger" onClick={showBatch}>
      Show Batch Events
    </button>
  );
}
