import { toast } from "sonner";

export default function SonnerLoadingDismissExample() {
  function start() {
    const id = toast.loading("Running cluster sync...");

    window.setTimeout(() => {
      toast.dismiss(id);
      toast.success("Cluster sync completed");
    }, 1600);
  }

  return (
    <button className="command-trigger" onClick={start}>
      Start Loading Toast
    </button>
  );
}
