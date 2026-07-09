import { toast } from "sonner";

export default function SonnerPersistentStatusExample() {
  function show() {
    toast.info("Waiting for CI", {
      description: "This toast stays until dismissed.",
      duration: Infinity
    });
  }

  return (
    <button className="command-trigger" onClick={show}>
      Show Persistent Status
    </button>
  );
}
