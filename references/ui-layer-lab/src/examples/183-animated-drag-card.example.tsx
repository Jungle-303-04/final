import { useRef, useState, type MouseEvent } from "react";

export default function AnimatedDragCardExample() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  function move(event: MouseEvent<HTMLElement>) {
    if (!draggingRef.current) return;
    const nextPoint = { x: event.clientX, y: event.clientY };
    setPosition((value) => ({
      x: Math.max(-130, Math.min(130, value.x + nextPoint.x - lastPoint.current.x)),
      y: Math.max(-70, Math.min(70, value.y + nextPoint.y - lastPoint.current.y))
    }));
    lastPoint.current = nextPoint;
  }

  function stopDragging() {
    draggingRef.current = false;
    setDragging(false);
  }

  function nudge() {
    setPosition((value) => ({
      x: value.x > 90 ? 0 : value.x + 28,
      y: value.y > 50 ? 0 : value.y + 12
    }));
  }

  return (
    <div className="drag-stage" onMouseMove={move} onMouseUp={stopDragging} onMouseLeave={stopDragging}>
      <button
        className={dragging ? "drag-card dragging" : "drag-card"}
        onMouseMove={move}
        onMouseDown={(event) => {
          lastPoint.current = { x: event.clientX, y: event.clientY };
          draggingRef.current = true;
          setDragging(true);
        }}
        onMouseUp={stopDragging}
        onClick={nudge}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        Drag me
        <span>{position.x}, {position.y}</span>
      </button>
    </div>
  );
}
