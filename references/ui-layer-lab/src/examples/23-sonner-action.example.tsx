import { toast } from "sonner";

export default function SonnerActionExample() {
  return (
    <button
      className="command-trigger"
      onClick={() =>
        toast("Deployment failed", {
          description: "Visual smoke did not pass.",
          action: {
            label: "Retry",
            onClick: () => toast.success("Retry queued")
          }
        })
      }
    >
      Show Action Toast
    </button>
  );
}
