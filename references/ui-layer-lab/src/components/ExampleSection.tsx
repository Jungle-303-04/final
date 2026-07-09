import { useState } from "react";
import type { RegisteredExample } from "../examples/types";
import { CodePanel } from "./CodePanel";
import { LazyPreview } from "./LazyPreview";
import { Badge } from "./primitives/Badge";

export function ExampleSection({ example }: { example: RegisteredExample }) {
  const [codeOpen, setCodeOpen] = useState(false);

  return (
    <section className="example-section" data-example-id={example.id} data-testid={`example-${example.id}`}>
      <h3>{example.title}</h3>
      <p>{example.description}</p>
      <div className="motion-intent">
        <strong>전환 의도</strong>
        <span>{example.motionIntent}</span>
      </div>
      {example.variantIds.length ? (
        <div className="variant-row" aria-label="통합된 변형">
          <Badge>통합 변형 {example.variantIds.length}개</Badge>
        </div>
      ) : null}

      <div className={`example-card ${codeOpen ? "code-open" : ""}`}>
        <LazyPreview Component={example.Component} />
        <CodePanel loadSource={example.loadSource} onToggle={() => setCodeOpen((value) => !value)} open={codeOpen} />
      </div>
    </section>
  );
}
