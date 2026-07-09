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
  assistant: "어시스턴트",
  async: "비동기",
  alert: "알림",
  bar: "막대",
  bands: "밴드",
  breakdown: "분해",
  breadcrumb: "브레드크럼",
  browser: "브라우저",
  builder: "빌더",
  calendar: "캘린더",
  cancel: "취소",
  card: "카드",
  chart: "차트",
  cloud: "클라우드",
  cluster: "클러스터",
  column: "컬럼",
  command: "명령",
  component: "컴포넌트",
  computing: "계산",
  collapsible: "접기",
  context: "컨텍스트",
  copilot: "코파일럿",
  countdown: "카운트다운",
  chips: "칩",
  copy: "복사",
  data: "데이터",
  delta: "변화량",
  dialog: "대화상자",
  diff: "차이",
  disabled: "비활성",
  drawer: "드로어",
  drilldown: "드릴다운",
  draw: "드로잉",
  edge: "엣지",
  error: "오류",
  failure: "실패",
  filter: "필터",
  filters: "필터",
  floating: "플로팅",
  flow: "Flow",
  flows: "흐름",
  freehand: "자유선",
  git: "Git",
  health: "상태",
  heatmap: "히트맵",
  history: "기록",
  inline: "인라인",
  inspector: "Inspector",
  intersections: "교차",
  items: "항목",
  job: "작업",
  kanban: "칸반",
  layer: "레이어",
  lanes: "레인",
  lasso: "라쏘",
  launch: "실행",
  level: "레벨",
  link: "링크",
  list: "목록",
  log: "로그",
  logs: "로그",
  matrix: "행렬",
  modal: "모달",
  metric: "지표",
  mode: "모드",
  multi: "다중",
  node: "노드",
  overlay: "오버레이",
  panel: "패널",
  parallel: "병렬",
  palette: "팔레트",
  paused: "일시 정지",
  persistent: "고정",
  phase: "단계",
  pills: "칩",
  pivot: "피벗",
  progress: "진행률",
  preview: "미리보기",
  queued: "대기열",
  rectangle: "사각 선택",
  react: "React",
  recent: "최근",
  reconnect: "재연결",
  report: "보고",
  result: "결과",
  retry: "재시도",
  resize: "크기 조절",
  reasoning: "추론",
  restore: "복원",
  review: "검토",
  rewrite: "재작성",
  ring: "링",
  save: "저장",
  saved: "저장됨",
  search: "검색",
  selection: "선택",
  sidebar: "사이드바",
  sidecar: "사이드카",
  skeleton: "스켈레톤",
  sla: "SLA",
  sonner: "알림",
  state: "상태",
  status: "상태",
  stack: "스택",
  subflow: "하위 흐름",
  swipe: "스와이프",
  table: "테이블",
  tabs: "탭",
  tag: "태그",
  temporary: "임시",
  toast: "토스트",
  top: "상단",
  toolbar: "툴바",
  tooltip: "툴팁",
  tray: "트레이",
  tree: "트리",
  types: "유형",
  update: "갱신",
  view: "보기",
  waterfall: "워터폴",
  weekday: "요일",
  whiteboard: "화이트보드",
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
  if (id.startsWith("ai-") || id.startsWith("assistant-")) return "ai-layer";
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
