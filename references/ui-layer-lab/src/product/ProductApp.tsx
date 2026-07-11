import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { createApiComposition } from "./app/apiComposition";
import { ProductErrorBoundary } from "./app/ProductErrorBoundary";
import { ProductRouter } from "./app/ProductRouter";
import "./styles/tokens.css";
import "./styles/foundation.css";

export interface ProductAppProps {
  compositionFactory?: typeof createApiComposition;
}

export default function ProductApp({
  compositionFactory = createApiComposition,
}: ProductAppProps) {
  useEffect(() => {
    document.title = "KubeHeal";
  }, []);

  return (
    <ProductErrorBoundary>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        storageKey="kubeheal-theme"
        themes={["light", "dark"]}
      >
        <ProductRuntime compositionFactory={compositionFactory} />
      </ThemeProvider>
    </ProductErrorBoundary>
  );
}

function ProductRuntime({
  compositionFactory,
}: {
  compositionFactory: typeof createApiComposition;
}) {
  const [composition] = useState(compositionFactory);

  return (
    <BrowserRouter>
      <ProductRouter composition={composition} />
    </BrowserRouter>
  );
}
