import { toast } from "sonner";

export default function SonnerPromiseExample() {
  function deploy() {
    toast.promise(new Promise<string>((resolve) => window.setTimeout(() => resolve("Preview deployed"), 1500)), {
      loading: "Deploying preview...",
      success: (message) => message,
      error: "Deploy failed"
    });
  }

  return (
    <button className="command-trigger" onClick={deploy}>
      Deploy Preview
    </button>
  );
}
