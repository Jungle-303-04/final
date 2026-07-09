import { toast } from "sonner";

export default function SonnerCopyActionExample() {
  function copy() {
    toast.success("Command copied", {
      description: "npm run build",
      action: {
        label: "Copy again",
        onClick: () => toast("Copied to clipboard")
      }
    });
  }

  return (
    <button className="command-trigger" onClick={copy}>
      Copy Build Command
    </button>
  );
}
