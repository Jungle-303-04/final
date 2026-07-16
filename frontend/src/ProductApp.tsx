import { ThemeProvider } from "next-themes";
import { lazy, Suspense, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { createAuthBootstrap } from "./app/authBootstrap";
import { ProductErrorBoundary } from "./app/ProductErrorBoundary";
import { AuthBarrier } from "./features/auth/AuthBarrier";
import { ProductStateScreen } from "./shared/ui/ProductStateScreen";
import { I18nProvider } from "./shared/i18n";
import "./styles/tokens.css";
import "./styles/foundation.css";

const AuthenticatedProductRuntime = lazy(async () => ({
  default: (await import("./app/AuthenticatedProductRuntime")).AuthenticatedProductRuntime,
}));
const AlertNotificationPreview = lazy(async () => ({
  default: (await import("./app/AlertNotificationPreview")).AlertNotificationPreview,
}));

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
  const [authPort] = useState(createAuthBootstrap);
  const alertPreview = import.meta.env.DEV
    && new URLSearchParams(window.location.search).has("alert-preview");

  return (
    <BrowserRouter>
      <Suspense fallback={<ProductStateScreen kind="loading" />}>
        {alertPreview ? (
          <AlertNotificationPreview />
        ) : (
          <AuthBarrier port={authPort}>
            {(auth) => (
            <AuthenticatedProductRuntime
              auth={auth}
              authPort={authPort}
              key={`${auth.session.workspaceId}:${auth.session.userId}`}
            />
            )}
          </AuthBarrier>
        )}
      </Suspense>
    </BrowserRouter>
  );
}
