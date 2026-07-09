import { toast } from "sonner";

export default function SonnerCountdownExample() {
  function start() {
    const id = toast("Retrying in 3...");
    window.setTimeout(() => toast("Retrying in 2...", { id }), 600);
    window.setTimeout(() => toast("Retrying in 1...", { id }), 1200);
    window.setTimeout(() => toast.success("Retry started", { id }), 1800);
  }

  return (
    <button className="command-trigger" onClick={start}>
      Start Countdown
    </button>
  );
}
