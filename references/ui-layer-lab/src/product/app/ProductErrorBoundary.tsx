import { Component, Fragment, type ReactNode } from "react";
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
      return (
        <ProductStateScreen
          issue={{
            code: "unknown",
            safeDetail: "화면을 표시하는 중 예기치 않은 오류가 발생했습니다.",
          }}
          kind="error"
          retry={{
            label: "화면 다시 열기",
            pending: false,
            onRetry: this.retry,
          }}
        />
      );
    }

    return (
      <Fragment key={this.state.resetRevision}>
        {this.props.children}
      </Fragment>
    );
  }
}
