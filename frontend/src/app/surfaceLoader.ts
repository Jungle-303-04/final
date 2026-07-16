import type { ComponentType } from "react";

export interface ProductSurfaceModule {
  default: ComponentType;
}

export interface ProductSurfaceLoader {
  load(): Promise<ProductSurfaceModule>;
  reset(): void;
}

/**
 * A per-session, side-effect-free module cache. A failed import is deliberately
 * not retained so the route error boundary can create a fresh React.lazy type.
 */
export function createProductSurfaceLoader(
  factory: () => Promise<ProductSurfaceModule>,
): ProductSurfaceLoader {
  let current: Promise<ProductSurfaceModule> | null = null;

  return {
    load() {
      if (current === null) {
        current = factory().catch((error: unknown) => {
          current = null;
          throw error;
        });
      }
      return current;
    },
    reset() {
      current = null;
    },
  };
}
