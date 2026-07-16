import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { ProductStateScreen } from "../shared/ui/ProductStateScreen";
import type { ProductSurfaceRegistration } from "./productComposition";

export function RouteSurface({ registration }: { registration: ProductSurfaceRegistration }) {
  const [attempt, setAttempt] = useState(0);
  const [LazySurface, setLazySurface] = useState(() => createLazySurface(registration.loader));
  const retry = useCallback(() => {
    registration.loader.reset();
    setLazySurface(() => createLazySurface(registration.loader));
    setAttempt((current) => current + 1);
  }, [registration]);

  return (
    <RouteLoadBoundary key={attempt} onRetry={retry}>
      <Suspense fallback={<ProductStateScreen kind="loading" placement="content" />}>
        <LazySurface />
      </Suspense>
    </RouteLoadBoundary>
  );
}

function createLazySurface(loader: ProductSurfaceRegistration["loader"]): ComponentType {
  return lazy(() => loader.load());
}

class RouteLoadBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: true } {
    return { failed: true };
  }

  componentDidCatch() {
    console.error({
      boundary: "RouteLoadBoundary",
      event: "product.route_module_load_failed",
      recovery: "manual_retry",
      severity: "error",
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <ProductStateScreen
          issue={{ code: "unknown" }}
          kind="error"
          placement="content"
          retry={{ onRetry: this.props.onRetry, pending: false }}
        />
      );
    }
    return this.props.children;
  }
}
