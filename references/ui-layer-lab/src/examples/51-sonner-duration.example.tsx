import { toast } from "sonner";

export default function SonnerDurationExample() {
  return (
    <div className="button-grid">
      <button onClick={() => toast("Auto closes quickly", { duration: 1200 })}>Short</button>
      <button onClick={() => toast.info("Pinned for review", { duration: 8000 })}>Long</button>
      <button onClick={() => toast.warning("Manual close suggested", { duration: Infinity })}>Pinned</button>
    </div>
  );
}
