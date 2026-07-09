import { toast } from "sonner";

const positions = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right"
] as const;

export default function SonnerPositionExample() {
  return (
    <div className="button-grid">
      {positions.map((position) => (
        <button
          key={position}
          onClick={() =>
            toast(`Toast at ${position}`, {
              position
            })
          }
        >
          {position}
        </button>
      ))}
    </div>
  );
}
