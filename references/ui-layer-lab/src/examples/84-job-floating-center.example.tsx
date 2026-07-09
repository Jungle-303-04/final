import { useState } from "react";

export default function JobFloatingCenterExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="fake-page">
      <strong>Dashboard content</strong>
      <p>Global work can stay visible above the current screen.</p>
      {open ? (
        <section className="floating-job-center">
          <div className="drawer-header">
            <strong>2 jobs running</strong>
            <button onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="progress-track">
            <div style={{ width: "54%" }} />
          </div>
          <span>Pulling origin and building preview...</span>
        </section>
      ) : (
        <button className="command-trigger" onClick={() => setOpen(true)}>
          Show Job Center
        </button>
      )}
    </div>
  );
}
