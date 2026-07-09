import { toast } from "sonner";

export default function SonnerBasicExample() {
  return (
    <button className="command-trigger" onClick={() => toast("Event has been created.")}>
      Show Toast
    </button>
  );
}
