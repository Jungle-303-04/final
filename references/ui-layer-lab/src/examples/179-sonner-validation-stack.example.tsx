import { useState } from "react";
import { toast } from "sonner";

export default function SonnerValidationStackExample() {
  const [name, setName] = useState("");

  function submit() {
    if (!name.trim()) {
      toast.error("Project name is required", { description: "Fill the highlighted field before continuing." });
      return;
    }
    toast.success("Project created");
  }

  return (
    <div className="validation-card">
      <label>
        Project name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="ui-layer-lab" />
      </label>
      <button className="command-trigger" onClick={submit}>Create</button>
    </div>
  );
}
