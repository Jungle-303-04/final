import { toast } from "sonner";

export default function SonnerDescriptionExample() {
  return (
    <button
      className="command-trigger"
      onClick={() =>
        toast("Pull request created", {
          description: "feature/ui-layer-lab is ready for review."
        })
      }
    >
      Show Toast
    </button>
  );
}
