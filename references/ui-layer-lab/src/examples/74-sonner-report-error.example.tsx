import { toast } from "sonner";

export default function SonnerReportErrorExample() {
  function report() {
    toast.error("Push failed", {
      description: "origin rejected the update",
      action: {
        label: "View logs",
        onClick: () => toast.info("Opening push logs...")
      }
    });
  }

  return (
    <button className="command-trigger" onClick={report}>
      Report Error
    </button>
  );
}
