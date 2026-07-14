import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import type { ApplicationsFailure } from "./applicationsContract";

export function ApplicationsFailureState({
  failure,
  onRetry,
}: {
  failure: ApplicationsFailure;
  onRetry: () => void;
}) {
  if (failure.code === "forbidden") {
    return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
  }
  if (failure.code === "offline") {
    return (
      <ProductStateScreen
        issue={{ code: "network" }}
        kind="offline"
        placement="content"
        retry={{ onRetry, pending: false }}
      />
    );
  }
  return (
    <ProductStateScreen
      issue={{ code: failure.code === "invalid-response" ? "invalid-response" : "server" }}
      kind="error"
      placement="content"
      retry={{ onRetry, pending: false }}
    />
  );
}
