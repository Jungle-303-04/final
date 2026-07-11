import { Navigate, Route, Routes } from "react-router-dom";
import type { AuthSession } from "../api";
import { FleetRoute } from "../features/fleet/FleetRoute";
import { MetricsConnectionPage } from "../features/metrics/MetricsConnectionPage";
import { ProductStateScreen } from "../shared/ui/ProductStateScreen";
import { ProductShell } from "./ProductShell";

interface ProductRouterProps {
  session: AuthSession;
  onSignOut: () => Promise<void>;
}

export function ProductRouter({ session, onSignOut }: ProductRouterProps) {
  return (
    <Routes>
      <Route element={<ProductShell session={session} onSignOut={onSignOut} />}>
        <Route path="/product" element={<FleetRoute />} />
        <Route path="/metrics" element={<MetricsConnectionPage />} />
        <Route path="/product/metrics" element={<Navigate replace to="/metrics" />} />
        <Route path="*" element={<ProductStateScreen kind="error" error="요청한 제품 화면을 찾을 수 없습니다." />} />
      </Route>
    </Routes>
  );
}
