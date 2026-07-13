import React from "react";
import ReactDOM from "react-dom/client";

const isProductRoute =
  window.location.pathname === "/product" ||
  window.location.pathname.startsWith("/product/");

const appModule = isProductRoute
  ? import("./product/ProductApp")
  : import("./App");

void appModule.then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
