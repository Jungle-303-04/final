import { toast } from "sonner";

export default function SonnerCustomContentExample() {
  return (
    <button
      className="command-trigger"
      onClick={() =>
        toast.custom((id) => (
          <div className="custom-toast">
            <strong>Deploy preview ready</strong>
            <span>feature/ui-layer-lab</span>
            <button onClick={() => toast.dismiss(id)}>Dismiss</button>
          </div>
        ))
      }
    >
      Show Custom Toast
    </button>
  );
}
