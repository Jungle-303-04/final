import { toast } from "sonner";

export default function SonnerMultiActionExample() {
  function show() {
    toast.custom(() => (
      <div className="custom-toast">
        <strong>Workflow failed</strong>
        <span>Choose the next action.</span>
        <div className="tool-call-actions">
          <button onClick={() => toast.info("Opening logs")}>Logs</button>
          <button onClick={() => toast.info("Retry queued")}>Retry</button>
        </div>
      </div>
    ));
  }

  return (
    <button className="command-trigger" onClick={show}>
      Show Multi Action Toast
    </button>
  );
}
