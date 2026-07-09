import { lazy } from "react";
import { categories, exposedExamples, variantGroups } from "./catalog";
import type { ExampleModule, RegisteredExample } from "./types";

const componentModules = import.meta.glob<ExampleModule>("./*.example.tsx");
const sourceModules = import.meta.glob<string>("./*.example.tsx", {
  import: "default",
  query: "?raw"
});

const loaders = Object.fromEntries(
  Object.entries(componentModules).map(([path, component]) => {
    const file = path.split("/").pop() ?? "";
    const source = sourceModules[path];

    return [
      file,
      {
        component,
        source: async () => (source ? await source() : "")
      }
    ];
  })
);

export const registeredExamples: RegisteredExample[] = exposedExamples.map((entry, order) => {
  const loader = loaders[entry.file];
  if (!loader) {
    throw new Error(`Missing loader for ${entry.file}`);
  }

  return {
    ...entry,
    order,
    Component: lazy(loader.component),
    loadSource: async () => (await loader.source()).trim()
  };
});

export { categories, exposedExamples, variantGroups };

export function groupedExamples() {
  return categories
    .map((category) => ({
      ...category,
      archivedCount: variantGroups
        .filter((group) => registeredExamples.some((example) => example.id === group.representativeId && example.category === category.id))
        .reduce((sum, group) => sum + group.archivedIds.length, 0),
      examples: registeredExamples.filter((example) => example.category === category.id)
    }))
    .filter((group) => group.examples.length > 0);
}
