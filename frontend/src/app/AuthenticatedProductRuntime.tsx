import { useEffect, useState } from "react";
import type { AuthenticatedAuthState, AuthPort } from "../features/auth/authContract";
import { createApiComposition } from "./apiComposition";
import { ProductRouter } from "./ProductRouter";

export function AuthenticatedProductRuntime({
  auth,
  authPort,
}: {
  auth: AuthenticatedAuthState;
  authPort: AuthPort;
}) {
  const [composition] = useState(() => createApiComposition(authPort));

  useEffect(() => () => composition.dispose(), [composition]);

  return <ProductRouter auth={auth} composition={composition} />;
}
