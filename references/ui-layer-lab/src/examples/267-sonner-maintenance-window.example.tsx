import { toast } from "sonner";

export default function SonnerMaintenanceWindowExample() {
  return (
    <button
      className="command-trigger"
      onClick={() => toast.info("Maintenance starts at 02:00", { description: "Deploy actions will pause for 15 minutes." })}
    >
      Announce Maintenance
    </button>
  );
}
