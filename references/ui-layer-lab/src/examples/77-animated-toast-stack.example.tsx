import { useState } from "react";

export default function AnimatedToastStackExample() {
  const [items, setItems] = useState(["Build started", "Typecheck running"]);

  function push() {
    setItems((current) => [`Event ${current.length + 1}`, ...current].slice(0, 4));
  }

  return (
    <div className="toast-stack-demo">
      <button className="command-trigger" onClick={push}>
        Push Event
      </button>
      <div className="toast-stack">
        {items.map((item, index) => (
          <div className="stack-toast" key={item} style={{ transform: `translateY(${index * 10}px) scale(${1 - index * 0.04})` }}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
