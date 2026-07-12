import { Component, Fragment, type ReactNode } from "react";
import { useI18n } from "../shared/i18n";
import { ProductStateScreen } from "../shared/ui/ProductStateScreen";

export interface ProductErrorBoundaryProps {
  children: ReactNode;
}

interface ProductErrorBoundaryState {
  failed: boolean;
  resetRevision: number;
}

export class ProductErrorBoundary extends Component<
  ProductErrorBoundaryProps,
  ProductErrorBoundaryState
> {
  state: ProductErrorBoundaryState = {
    failed: false,
    resetRevision: 0,
  };

  static getDerivedStateFromError(): Partial<ProductErrorBoundaryState> {
    return { failed: true };
  }

  componentDidCatch() {
    console.error({
      boundary: "ProductErrorBoundary",
      event: "product.error_boundary.caught",
      recovery: "manual_retry",
      severity: "error",
    });
    this.focusProductMain();
  }

  private readonly focusProductMain = () => {
    document.getElementById("product-main")?.focus();
  };

  private readonly retry = () => {
    this.setState(
      ({ resetRevision }) => ({
        failed: false,
        resetRevision: resetRevision + 1,
      }),
      this.focusProductMain,
    );
  };

  render() {
    if (this.state.failed) {
      return <ProductErrorFallback onRetry={this.retry} />;
    }

    return (
      <Fragment key={this.state.resetRevision}>
        {this.props.children}
      </Fragment>
    );
  }
}

function ProductErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();

  return (
    <ProductStateScreen
      issue={{ code: "unknown" }}
      kind="error"
      retry={{
        label: t("common.action.reopen"),
        pending: false,
        onRetry,
      }}
    />
  );
}
