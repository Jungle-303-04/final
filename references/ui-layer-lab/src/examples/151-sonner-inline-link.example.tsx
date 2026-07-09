import { toast } from "sonner";

export default function SonnerInlineLinkExample() {
  function show() {
    toast("Workflow failed", {
      description: "Open the run detail to inspect logs.",
      action: {
        label: "Open",
        onClick: () => toast.info("Run detail opened")
      }
    });
  }

  return (
    <button className="command-trigger" onClick={show}>
      Show Linked Toast
    </button>
  );
}
