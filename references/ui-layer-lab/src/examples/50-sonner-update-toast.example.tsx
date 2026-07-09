import { toast } from "sonner";

export default function SonnerUpdateToastExample() {
  function run() {
    const id = toast.loading("Cloning repository...");

    window.setTimeout(() => toast.loading("Installing dependencies...", { id }), 700);
    window.setTimeout(() => toast.success("Workspace ready", { id }), 1600);
  }

  return (
    <button className="command-trigger" onClick={run}>
      Update Toast
    </button>
  );
}
