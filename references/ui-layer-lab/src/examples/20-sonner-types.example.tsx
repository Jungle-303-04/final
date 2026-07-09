import { toast } from "sonner";

export default function SonnerTypesExample() {
  return (
    <div className="button-grid">
      <button onClick={() => toast("Default toast")}>Default</button>
      <button onClick={() => toast.success("Saved successfully")}>Success</button>
      <button onClick={() => toast.info("New deployment started")}>Info</button>
      <button onClick={() => toast.warning("Approval is required")}>Warning</button>
      <button onClick={() => toast.error("Deploy failed")}>Error</button>
      <button
        onClick={() =>
          toast.promise(new Promise((resolve) => window.setTimeout(resolve, 1400)), {
            loading: "Syncing repository...",
            success: "Repository synced",
            error: "Sync failed"
          })
        }
      >
        Promise
      </button>
    </div>
  );
}
