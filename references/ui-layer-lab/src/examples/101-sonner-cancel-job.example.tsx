import { toast } from "sonner";
import { useState } from "react";

export default function SonnerCancelJobExample() {
  const [status, setStatus] = useState("idle");

  function start() {
    setStatus("running");
    const id = toast.loading("Generating summary...", {
      action: {
        label: "Cancel",
        onClick: () => {
          setStatus("cancelled");
          toast.dismiss(id);
          toast.warning("Summary cancelled");
        }
      }
    });

    window.setTimeout(() => {
      setStatus((current) => {
        if (current === "cancelled") return current;
        toast.success("Summary ready", { id });
        return "success";
      });
    }, 1800);
  }

  return (
    <div className="example-stack">
      <button className="command-trigger" onClick={start}>
        Start Summary
      </button>
      <span className="muted">{status}</span>
    </div>
  );
}
