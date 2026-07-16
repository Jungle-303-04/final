import type { HomePort } from "../../features/home/homeContract";
import type { OperationStatusStore } from "../../features/operations/OperationStatusStore";
import {
  createProductSurfaceLoader,
  type ProductSurfaceLoader,
  type ProductSurfaceModule,
} from "../surfaceLoader";

interface PortRegistryOptions {
  homePort: HomePort;
  operationStatusStore: OperationStatusStore;
}

export interface PortRegistry {
  readonly homePort: HomePort;
  createSurfaceLoader(factory: () => Promise<ProductSurfaceModule>): ProductSurfaceLoader;
  dispose(): void;
}

/**
 * Owns ports and route-module caches for one authenticated workspace/user
 * lifetime. Creating an adapter or loading a module never starts a request;
 * pages retain ownership of fetch, stream, and cleanup effects after mount.
 */
export function createPortRegistry({
  homePort,
  operationStatusStore,
}: PortRegistryOptions): PortRegistry {
  const loaders = new Set<ProductSurfaceLoader>();
  let disposed = false;

  return {
    homePort,
    createSurfaceLoader(factory) {
      const loader = createProductSurfaceLoader(async () => {
        if (disposed) throw new Error("authenticated composition session is disposed");
        return factory();
      });
      loaders.add(loader);
      return loader;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loaders.forEach((loader) => loader.reset());
      loaders.clear();
      operationStatusStore.dispose();
    },
  };
}
