import type { ComponentType } from "react";

export type ExampleModule = {
  default: ComponentType;
};

export type RegisteredExample = {
  id: string;
  title: string;
  order: number;
  Component: ComponentType;
  source: string;
};
