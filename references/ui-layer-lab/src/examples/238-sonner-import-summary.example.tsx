import { toast } from "sonner";

export default function SonnerImportSummaryExample() {
  function show() {
    toast.custom(() => (
      <div className="custom-toast">
        <strong>Import finished</strong>
        <span>42 rows imported</span>
        <span>3 rows skipped</span>
      </div>
    ));
  }

  return <button className="command-trigger" onClick={show}>Show Import Summary</button>;
}
