import { useEffect, useState } from "react";
import type { AuthenticatedAuthState, AuthPort } from "../features/auth/authContract";
import { ProductStateScreen } from "../shared/ui/ProductStateScreen";
import { createApiComposition } from "./apiComposition";
import type { ProductComposition } from "./productComposition";
import { ProductRouter } from "./ProductRouter";

export function AuthenticatedProductRuntime({
  auth,
  authPort,
}: {
  auth: AuthenticatedAuthState;
  authPort: AuthPort;
}) {
  const [composition, setComposition] = useState<ProductComposition | null>(null);

  useEffect(() => {
    const nextComposition = createApiComposition(authPort);
    let active = true;
    queueMicrotask(() => {
      if (active) setComposition(nextComposition);
    });
    return () => {
      active = false;
      nextComposition.dispose();
    };
  }, [authPort]);

  if (composition === null) return <ProductStateScreen kind="loading" />;
  return <ProductRouter auth={auth} composition={composition} />;
}
