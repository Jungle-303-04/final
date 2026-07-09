import { useState } from "react";

const facets = {
  status: ["failed", "passed", "skipped"],
  owner: ["me", "team", "bot"],
  branch: ["main", "preview", "release"]
};

export default function DrilldownFacetInspectorExample() {
  const [facet, setFacet] = useState<keyof typeof facets>("status");

  return (
    <div className="column-browser">
      <div>{Object.keys(facets).map((item) => <button className={facet === item ? "active" : ""} key={item} onClick={() => setFacet(item as keyof typeof facets)}>{item}</button>)}</div>
      <div>{facets[facet].map((item) => <button key={item}>{item}</button>)}</div>
      <div><strong>{facet} facet</strong></div>
    </div>
  );
}
