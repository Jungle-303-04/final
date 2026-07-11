import { useFleetData } from "../../app/useProductData";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { FleetPage } from "./FleetPage";

export function FleetRoute() {
  const { state, refresh } = useFleetData();

  if (state.status === "loading") return <ProductStateScreen kind="loading" />;
  if (state.status === "error") {
    return <ProductStateScreen kind="error" error={state.error.message} onRetry={refresh} />;
  }

  return (
    <FleetPage
      fleet={state.fleet}
      timeline={state.timeline}
      timelineError={state.timelineError}
      onRefresh={refresh}
    />
  );
}
