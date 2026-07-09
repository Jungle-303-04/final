import { Command } from "cmdk";
import { useState } from "react";

const facets = ["failed", "owner:frontend", "duration:slow"];

export default function DrilldownFacetedCommandLinkExample() {
  const [facet, setFacet] = useState(facets[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="Add drilldown facet..." />
        <Command.List>
          <Command.Group heading="Facets">
            {facets.map((item) => <Command.Item key={item} onSelect={() => setFacet(item)} value={item}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{facet}</strong>
        <span>Drilldown list filtered by command facet</span>
      </aside>
    </div>
  );
}
