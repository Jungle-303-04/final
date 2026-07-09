import { useState } from "react";

const items = [
  { id: "pull", title: "Git pull", detail: "Fetching origin, rebasing local commits, and refreshing status." },
  { id: "test", title: "Test run", detail: "TypeScript and browser smoke checks are running." },
  { id: "push", title: "Push", detail: "Uploading branch and waiting for remote acknowledgement." }
];

export default function AnimatedAccordionExample() {
  const [open, setOpen] = useState(items[0].id);

  return (
    <div className="animated-accordion">
      {items.map((item) => (
        <section className={item.id === open ? "open" : ""} key={item.id}>
          <button onClick={() => setOpen(item.id)}>{item.title}</button>
          {item.id === open ? <p>{item.detail}</p> : null}
        </section>
      ))}
    </div>
  );
}
