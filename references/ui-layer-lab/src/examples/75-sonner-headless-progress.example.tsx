import { toast } from "sonner";

export default function SonnerHeadlessProgressExample() {
  function show() {
    toast.custom((id) => (
      <div className="custom-toast">
        <strong>Indexing repository</strong>
        <span>Scanning changed files...</span>
        <div className="progress-track">
          <div style={{ width: "68%" }} />
        </div>
        <button onClick={() => toast.dismiss(id)}>Dismiss</button>
      </div>
    ));
  }

  return (
    <button className="command-trigger" onClick={show}>
      Show Progress Toast
    </button>
  );
}
