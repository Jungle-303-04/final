import { BrowserRouter } from "react-router-dom";
import { useEffect } from "react";
import { LoginScreen } from "./features/auth/LoginScreen";
import { ProductRouter } from "./app/ProductRouter";
import { useProductSession } from "./app/useProductData";
import { ProductStateScreen } from "./shared/ui/ProductStateScreen";
import "./styles/tokens.css";
import "./styles/foundation.css";
import "./styles/fleet.css";
import "./styles/metrics.css";

export default function ProductApp() {
  const { state, refresh, submitLogin, signOut } = useProductSession();

  useEffect(() => {
    document.title = "KubeHeal";
  }, []);

  if (state.status === "loading") return <ProductStateScreen kind="loading" />;
  if (state.status === "unauthenticated") {
    return <LoginScreen error={state.error} onSubmit={submitLogin} />;
  }
  if (state.status === "offline") {
    return <ProductStateScreen kind="offline" error={state.error.message} onRetry={refresh} />;
  }
  return (
    <BrowserRouter>
      <ProductRouter session={state.session} onSignOut={signOut} />
    </BrowserRouter>
  );
}
