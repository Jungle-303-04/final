import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { createApiComposition } from "./app/apiComposition";
import { ProductRouter } from "./app/ProductRouter";
import "./styles/tokens.css";
import "./styles/foundation.css";

const composition = createApiComposition();

export default function ProductApp() {
  useEffect(() => {
    document.title = "KubeHeal";
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="kubeheal-theme"
      themes={["light", "dark"]}
    >
      <BrowserRouter>
        <ProductRouter composition={composition} />
      </BrowserRouter>
    </ThemeProvider>
  );
}
