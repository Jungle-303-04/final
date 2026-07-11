import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProductStateScreen } from "../../src/product/shared/ui/ProductStateScreen";
import { StatusMark } from "../../src/product/shared/ui/StatusMark";
import { Surface } from "../../src/product/shared/ui/Surface";
import { Button } from "../../src/product/shared/ui/primitives/button";
import "../../src/product/styles/tokens.css";
import "../../src/product/styles/foundation.css";

const root = document.getElementById("root");
if (!root) throw new Error("Visual harness root is missing");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="kubeheal-theme"
      themes={["light", "dark"]}
    >
      <ProductStateVisualHarness />
    </ThemeProvider>
  </StrictMode>,
);

function ProductStateVisualHarness() {
  return (
    <main className="min-h-svh bg-background p-4 text-foreground" id="product-main" tabIndex={-1}>
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <header className="grid gap-1">
          <p className="text-xs font-medium text-muted-foreground">VISUAL TEST HARNESS</p>
          <h1 className="text-xl font-semibold tracking-tight">공통 상태·작업 접근성 검증</h1>
        </header>

        <ProductStateScreen
          issue={{
            code: "invalid-response",
            correlationId: "visual-gate-correlation-0123456789-abcdefghijklmnopqrstuvwxyz",
            safeDetail:
              "시각게이트용긴오류설명_줄바꿈지점이없는문자열도카드와뷰포트를벗어나지않아야합니다_0123456789",
          }}
          kind="error"
          placement="content"
          retry={{
            label: "연결 상태를 다시 확인하고 마지막으로 검증된 데이터를 불러오기",
            onRetry: () => undefined,
            pending: false,
          }}
        />

        <Surface aria-labelledby="status-harness-title" className="grid gap-4 p-4">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold" id="status-harness-title">상태와 작업</h2>
            <p className="text-sm text-muted-foreground">
              색을 제거해도 상태 문자, 테두리, 포커스 표시와 비활성 작업이 구분되어야 합니다.
            </p>
          </div>
          <StatusMark label="연결 지연 — 마지막 관측값이 오래되었습니다" tone="warning" />
          <div className="flex flex-wrap gap-2">
            <Button data-visual-focus-target type="button" variant="outline">포커스 확인</Button>
            <Button disabled type="button" variant="outline">비활성 작업</Button>
          </div>
        </Surface>
      </div>
    </main>
  );
}
