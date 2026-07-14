import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { createApiComposition } from "./app/apiComposition";
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
          defaultTheme="system"
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
  const [composition] = useState(createApiComposition);

  return (
    <BrowserRouter>
      <AuthBarrier port={composition.auth}>
        {(auth) => <ProductRouter auth={auth} composition={composition} />}
      </AuthBarrier>
    </BrowserRouter>
  );
}
