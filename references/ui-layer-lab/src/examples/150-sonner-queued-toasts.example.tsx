import { toast } from "sonner";

export default function SonnerQueuedToastsExample() {
  function queue() {
    ["Queued", "Running", "Completed"].forEach((state, index) => {
      window.setTimeout(() => toast(state), index * 500);
    });
  }

  return (
    <button className="command-trigger" onClick={queue}>
      Queue Toasts
    </button>
  );
}
