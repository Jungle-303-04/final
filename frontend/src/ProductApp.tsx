import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { createApiComposition } from "./app/apiComposition";
import { createDemoComposition } from "./app/demoComposition";
import { ProductErrorBoundary } from "./app/ProductErrorBoundary";
import { ProductRouter } from "./app/ProductRouter";
import { AuthBarrier } from "./features/auth/AuthBarrier";
import { I18nProvider } from "./shared/i18n";
import "./styles/tokens.css";
import "./styles/foundation.css";

export default function ProductApp() {
  return (
    <I18nProvider>
      <ProductErrorBoundary>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
          enableSystem
          storageKey="opsia-theme"
          themes={["light", "dark"]}
        >
          <ProductRuntime />
        </ThemeProvider>
      </ProductErrorBoundary>
    </I18nProvider>
  );
}

function ProductRuntime() {
  const [composition] = useState(createRuntimeComposition);

  return (
    <BrowserRouter>
      <AuthBarrier port={composition.auth}>
        {(auth) => <ProductRouter auth={auth} composition={composition} />}
      </AuthBarrier>
    </BrowserRouter>
  );
}

function createRuntimeComposition() {
  const demoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE !== "false";
  return demoMode ? createDemoComposition() : createApiComposition();
}
