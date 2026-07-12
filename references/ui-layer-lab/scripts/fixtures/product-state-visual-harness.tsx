import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../src/product/shared/i18n";
import { ProductStateScreen } from "../../src/product/shared/ui/ProductStateScreen";
import { StatusMark } from "../../src/product/shared/ui/StatusMark";
import { Surface } from "../../src/product/shared/ui/Surface";
import { Button } from "../../src/product/shared/ui/primitives/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "../../src/product/shared/ui/primitives/button-group";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "../../src/product/shared/ui/primitives/item";
import { Progress } from "../../src/product/shared/ui/primitives/progress";
import { ScrollArea } from "../../src/product/shared/ui/primitives/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../src/product/shared/ui/primitives/tabs";
import "../../src/product/styles/tokens.css";
import "../../src/product/styles/foundation.css";

const root = document.getElementById("root");
if (!root) throw new Error("Visual harness root is missing");

createRoot(root).render(
  <StrictMode>
    <I18nProvider navigatorLanguage="ko" storage={null}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        storageKey="kubeheal-theme"
        themes={["light", "dark"]}
      >
        <ProductStateVisualHarness />
      </ThemeProvider>
    </I18nProvider>
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
          <div className="grid gap-2">
            <Progress aria-label="완료 진행률" data-visual-progress="complete" value={100} />
            <Progress aria-label="불확정 진행률" data-visual-progress="indeterminate" value={null} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button data-visual-focus-target type="button" variant="outline">포커스 확인</Button>
            <Button disabled type="button" variant="outline">비활성 작업</Button>
          </div>
          <section aria-labelledby="interaction-primitives-title" className="grid min-w-0 gap-4">
            <div className="grid gap-1">
              <h2 className="text-sm font-medium" id="interaction-primitives-title">
                탭과 버튼 그룹
              </h2>
              <p className="text-sm text-muted-foreground">
                선택·포커스·비활성 상태와 가로·세로 결합 경계를 검증합니다.
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap items-start gap-3">
              <ButtonGroup aria-label="기간 선택" data-visual-button-group="horizontal">
                <Button data-visual-button-group-focus type="button" variant="outline">
                  1시간
                </Button>
                <ButtonGroupSeparator data-visual-button-group-separator="horizontal" />
                <Button disabled type="button" variant="outline">
                  6시간
                </Button>
                <Button type="button" variant="outline">
                  24시간
                </Button>
              </ButtonGroup>
              <ButtonGroup
                aria-label="표시 방식"
                data-visual-button-group="vertical"
                orientation="vertical"
              >
                <ButtonGroupText>배치</ButtonGroupText>
                <ButtonGroupSeparator data-visual-button-group-separator="vertical" />
                <Button type="button" variant="outline">압축</Button>
                <Button disabled type="button" variant="outline">분산</Button>
              </ButtonGroup>
            </div>

            <Tabs data-visual-tabs="default" defaultValue="overview">
              <TabsList aria-label="기본 리소스 탭" data-visual-tabs-list="default">
                <TabsTrigger data-visual-tabs-active="default" value="overview">
                  개요
                </TabsTrigger>
                <TabsTrigger data-visual-tabs-focus value="metrics">
                  지표
                </TabsTrigger>
                <TabsTrigger data-visual-tabs-disabled disabled value="events">
                  이벤트
                </TabsTrigger>
              </TabsList>
              <TabsContent data-visual-tabs-content="default" value="overview">
                기본 탭의 선택된 패널입니다.
              </TabsContent>
              <TabsContent value="metrics">지표 패널입니다.</TabsContent>
              <TabsContent value="events">이벤트 패널입니다.</TabsContent>
            </Tabs>

            <Tabs data-visual-tabs="line" defaultValue="traffic">
              <TabsList
                aria-label="선형 트래픽 탭"
                data-visual-tabs-list="line"
                variant="line"
              >
                <TabsTrigger
                  data-visual-tabs-active="line"
                  value="traffic"
                >
                  트래픽
                </TabsTrigger>
                <TabsTrigger value="routes">
                  라우팅
                </TabsTrigger>
                <TabsTrigger
                  disabled
                  value="policies"
                >
                  정책
                </TabsTrigger>
              </TabsList>
              <TabsContent data-visual-tabs-content="line" value="traffic">
                선형 탭의 선택된 패널입니다.
              </TabsContent>
              <TabsContent value="routes">라우팅 패널입니다.</TabsContent>
              <TabsContent value="policies">정책 패널입니다.</TabsContent>
            </Tabs>
          </section>
          <Item
            as="button"
            data-visual-disabled-item
            disabled
            variant="outline"
          >
            <ItemContent>
              <ItemTitle>비활성 리소스 작업</ItemTitle>
              <ItemDescription>
                현재 권한에서는 이 리소스 작업을 실행할 수 없습니다.
              </ItemDescription>
            </ItemContent>
          </Item>
          <div className="grid gap-2">
            <h2 className="text-sm font-medium" id="scroll-area-harness-title">
              실제 세로 오버플로 목록
            </h2>
            <ScrollArea
              aria-labelledby="scroll-area-harness-title"
              className="h-40 rounded-lg border border-border"
              data-visual-scroll-area
              orientation="vertical"
            >
              <div className="grid gap-2 p-2 pr-4">
                {Array.from({ length: 12 }, (_, index) => (
                  <div
                    className="rounded-md border border-border px-3 py-2 text-sm"
                    key={index}
                  >
                    감사 이벤트 {index + 1}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </Surface>
      </div>
    </main>
  );
}
