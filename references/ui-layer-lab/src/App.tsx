import { useState, type ReactNode } from "react";
import { examples, descriptionFor } from "./examples/registry";

export default function App() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>UI Layer Examples</h1>
        <p>동작하는 예제와 복사 가능한 코드만 모았습니다.</p>
      </header>

      <div className="example-list">
        {examples.map((example) => {
          const Example = example.Component;

          return (
            <ExampleSection
              key={example.id}
              title={example.title}
              description={descriptionFor(example.id)}
              source={example.source}
            >
              <Example />
            </ExampleSection>
          );
        })}
      </div>
    </main>
  );
}

function ExampleSection({
  title,
  description,
  source,
  children
}: {
  title: string;
  description: string;
  source: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="example-section">
      <h2>{title}</h2>
      <p>{description}</p>

      <div className={`example-card ${open ? "code-open" : ""}`}>
        <div className="preview-area">{children}</div>

        <div className="code-area">
          <button className="code-toggle" onClick={() => setOpen((value) => !value)}>
            {open ? "코드 닫기" : "코드 보기"}
          </button>
          <pre>
            <code>
              {source.split("\n").map((line, index) => (
                <span className="code-line" key={`${index}-${line}`}>
                  <span className="line-number">{index + 1}</span>
                  <span>{line || " "}</span>
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}
