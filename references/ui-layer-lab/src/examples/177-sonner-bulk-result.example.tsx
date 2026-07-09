import { toast } from "sonner";

const files = ["App.tsx", "registry.ts", "styles.css"];

export default function SonnerBulkResultExample() {
  function run() {
    toast.custom(() => (
      <div className="custom-toast">
        <strong>3 files formatted</strong>
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
    ));
  }

  return (
    <button className="command-trigger" onClick={run}>
      Show Bulk Result
    </button>
  );
}
