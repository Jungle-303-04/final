import { lazy } from "react";
import { categories, exposedExamples, variantGroups } from "./catalog";
import type { ExampleCatalogEntry, ExampleModule, RegisteredExample } from "./types";

const componentModules = import.meta.glob<ExampleModule>("./*.example.tsx");
const sourceModules = import.meta.glob<string>("./*.example.tsx", {
  import: "default",
  query: "?raw"
});

const loaders = Object.fromEntries(
  Object.entries(componentModules).map(([path, component]) => {
    const file = path.split("/").pop() ?? "";
    const source = sourceModules[path];

    return [
      file,
      {
        component,
        source: async () => (source ? await source() : "")
      }
    ];
  })
);

const catalogEntriesByFile = new Map(exposedExamples.map((entry) => [entry.file, entry]));

const titleWords: Record<string, string> = {
  accordion: "아코디언",
  action: "액션",
  actions: "액션",
  ai: "AI",
  animated: "애니메이션",
  approval: "승인",
  artifact: "아티팩트",
  async: "비동기",
  bar: "막대",
  breadcrumb: "브레드크럼",
  builder: "빌더",
  calendar: "캘린더",
  card: "카드",
  chart: "차트",
  command: "명령",
  component: "컴포넌트",
  context: "컨텍스트",
  dialog: "대화상자",
  drawer: "드로어",
  drilldown: "드릴다운",
  edge: "엣지",
  filter: "필터",
  filters: "필터",
  flow: "Flow",
  git: "Git",
  health: "상태",
  heatmap: "히트맵",
  inspector: "Inspector",
  job: "작업",
  launch: "실행",
  log: "로그",
  logs: "로그",
  matrix: "행렬",
  modal: "모달",
  node: "노드",
  overlay: "오버레이",
  panel: "패널",
  palette: "팔레트",
  pills: "칩",
  progress: "진행률",
  react: "React",
  recent: "최근",
  result: "결과",
  search: "검색",
  sidebar: "사이드바",
  skeleton: "스켈레톤",
  sonner: "알림",
  state: "상태",
  status: "상태",
  table: "테이블",
  tabs: "탭",
  toast: "토스트",
  tooltip: "툴팁",
  workflow: "워크플로"
};

const catalogEntries = Object.keys(loaders)
  .map((file) => catalogEntriesByFile.get(file) ?? fallbackCatalogEntry(file))
  .sort((a, b) => orderForFile(a.file) - orderForFile(b.file));

export const registeredExamples: RegisteredExample[] = catalogEntries.map((entry, order) => {
  const loader = loaders[entry.file];
  if (!loader) {
    throw new Error(`Missing loader for ${entry.file}`);
  }

  return {
    ...entry,
    order,
    Component: lazy(loader.component),
    loadSource: async () => (await loader.source()).trim()
  };
});

export { categories, exposedExamples, variantGroups };

export function groupedExamples() {
  return categories
    .map((category) => ({
      ...category,
      archivedCount: variantGroups
        .filter((group) => registeredExamples.some((example) => example.id === group.representativeId && example.category === category.id))
        .reduce((sum, group) => sum + group.archivedIds.length, 0),
      examples: registeredExamples.filter((example) => example.category === category.id)
    }))
    .filter((group) => group.examples.length > 0);
}

function fallbackCatalogEntry(file: string): ExampleCatalogEntry {
  const id = file.replace(/^\d+-/, "").replace(/\.example\.tsx$/, "");
  const category = categoryForId(id);
  const categoryLabel = categories.find((item) => item.id === category)?.label ?? "UI 패턴";

  return {
    id,
    file,
    category,
    title: titleForId(id),
    description: `${categoryLabel}에서 참고할 수 있는 작동 예제입니다.`,
    motionIntent: "상태 전환은 컨테이너 크기를 가능한 유지하고, 변화가 일어난 위치만 시각적으로 강조합니다.",
    variantIds: []
  };
}

function orderForFile(file: string) {
  return Number(file.match(/^(\d+)/)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function categoryForId(id: string) {
  if (id.startsWith("command-")) return "overlay-command";
  if (id.startsWith("ai-")) return "ai-layer";
  if (id.startsWith("job-") || id.startsWith("sonner-")) return "job-logs";
  if (
    id.startsWith("drilldown-") ||
    id.startsWith("breadcrumb-") ||
    id.startsWith("timeline-") ||
    id.startsWith("table-") ||
    id.startsWith("tree-") ||
    id.startsWith("master-detail-")
  ) {
    return "drilldown-nav";
  }
  if (id.startsWith("react-flow-")) return "flow-builder";
  if (id.startsWith("heatmap-") || id.startsWith("chart-") || id.startsWith("calendar-")) return "data-viz";
  if (id.startsWith("animated-") || id.startsWith("shimmer-") || id.startsWith("scroll-")) return "motion";
  return "primitives";
}

function titleForId(id: string) {
  return id
    .split("-")
    .map((word) => titleWords[word] ?? word)
    .join(" ");
}
