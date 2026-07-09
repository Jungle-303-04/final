import type { ComponentType, LazyExoticComponent } from "react";

export type ExampleModule = {
  default: ComponentType;
};

export type CategoryDefinition = {
  id: string;
  label: string;
  purpose: string;
  whenToUse: string;
};

export type ExampleCatalogEntry = {
  id: string;
  file: string;
  category: string;
  title: string;
  description: string;
  motionIntent: string;
  variantIds: string[];
};

export type VariantGroup = {
  name: string;
  representativeId: string;
  archivedIds: string[];
};

export type RegisteredExample = {
  file: string;
  category: string;
  id: string;
  title: string;
  description: string;
  motionIntent: string;
  variantIds: string[];
  order: number;
  Component: ComponentType | LazyExoticComponent<ComponentType>;
  loadSource: () => Promise<string>;
};
