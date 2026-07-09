const logLines = Array.from({ length: 24 }, (_, index) => `line ${index + 1}: processing event chunk`);

export default function ScrollFadeExample() {
  return (
    <div className="scroll-fade-box">
      <div className="scroll-fade-content">
        {logLines.map((line) => (
          <code key={line}>{line}</code>
        ))}
      </div>
    </div>
  );
}
