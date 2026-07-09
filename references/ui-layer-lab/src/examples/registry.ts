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
  access: "접근",
  ai: "AI",
  agent: "에이전트",
  animated: "애니메이션",
  approval: "승인",
  artifact: "아티팩트",
  assistant: "어시스턴트",
  attachment: "첨부",
  attention: "주의",
  audit: "감사",
  autosave: "자동 저장",
  async: "비동기",
  alert: "알림",
  bar: "막대",
  bands: "밴드",
  breakdown: "분해",
  breadcrumb: "브레드크럼",
  brush: "브러시",
  bulk: "일괄",
  browser: "브라우저",
  builder: "빌더",
  calendar: "캘린더",
  cancel: "취소",
  card: "카드",
  cache: "캐시",
  chart: "차트",
  cheatsheet: "치트시트",
  cloud: "클라우드",
  cluster: "클러스터",
  column: "컬럼",
  command: "명령",
  component: "컴포넌트",
  computing: "계산",
  confirm: "확인",
  connector: "연결선",
  collapse: "접기",
  collapsible: "접기",
  context: "컨텍스트",
  copilot: "코파일럿",
  countdown: "카운트다운",
  chips: "칩",
  concurrency: "동시 실행",
  connection: "연결",
  controls: "제어",
  copy: "복사",
  data: "데이터",
  danger: "위험",
  dashboard: "대시보드",
  deep: "딥링크",
  delta: "변화량",
  dialog: "대화상자",
  diff: "차이",
  disabled: "비활성",
  dots: "점",
  download: "다운로드",
  drawer: "드로어",
  drag: "드래그",
  drilldown: "드릴다운",
  draw: "드로잉",
  dark: "다크",
  destructive: "삭제 확인",
  density: "밀도",
  disclosure: "점진 공개",
  edge: "엣지",
  editor: "편집기",
  error: "오류",
  events: "이벤트",
  exit: "종료",
  failure: "실패",
  federated: "통합",
  fields: "필드",
  filter: "필터",
  filters: "필터",
  floating: "플로팅",
  flaky: "불안정",
  flow: "Flow",
  flows: "흐름",
  freehand: "자유선",
  git: "Git",
  health: "상태",
  heatmap: "히트맵",
  helper: "가이드",
  handoff: "핸드오프",
  history: "기록",
  hover: "호버",
  indicator: "인디케이터",
  inline: "인라인",
  import: "가져오기",
  insert: "삽입",
  inspector: "Inspector",
  interruption: "중단",
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
  lift: "상승",
  limit: "제한",
  lines: "라인",
  list: "목록",
  log: "로그",
  logs: "로그",
  loading: "로딩",
  map: "맵",
  mask: "마스킹",
  matrix: "행렬",
  memory: "메모리",
  modal: "모달",
  model: "모델",
  metric: "지표",
  mode: "모드",
  morph: "모프",
  multi: "다중",
  network: "네트워크",
  node: "노드",
  object: "객체",
  optimistic: "낙관적",
  outlier: "이상치",
  overlay: "오버레이",
  panel: "패널",
  parallel: "병렬",
  parallax: "패럴랙스",
  palette: "팔레트",
  paste: "붙여넣기",
  paused: "일시 정지",
  persistent: "고정",
  permission: "권한",
  phase: "단계",
  pills: "칩",
  picker: "선택기",
  pivot: "피벗",
  progress: "진행률",
  preview: "미리보기",
  progressive: "점진",
  pulse: "펄스",
  query: "질의",
  queue: "대기열",
  queued: "대기열",
  quality: "품질",
  rate: "속도",
  rating: "평가",
  rectangle: "사각 선택",
  react: "React",
  recent: "최근",
  reconnect: "재연결",
  recovery: "복구",
  reorder: "재정렬",
  report: "보고",
  result: "결과",
  retry: "재시도",
  redo: "다시 실행",
  resize: "크기 조절",
  reasoning: "추론",
  reminder: "알림",
  request: "요청",
  restore: "복원",
  review: "검토",
  rewrite: "재작성",
  response: "응답",
  ring: "링",
  role: "역할",
  route: "경로",
  runner: "실행기",
  safety: "안전",
  save: "저장",
  saved: "저장됨",
  schema: "스키마",
  search: "검색",
  scroll: "스크롤",
  selection: "선택",
  shared: "공유",
  sidebar: "사이드바",
  sidecar: "사이드카",
  shortcut: "단축키",
  silent: "무음",
  skeleton: "스켈레톤",
  sla: "SLA",
  scope: "범위",
  secret: "시크릿",
  snippet: "스니펫",
  snippets: "스니펫",
  snooze: "미루기",
  sonner: "알림",
  state: "상태",
  status: "상태",
  step: "단계",
  stepper: "스텝퍼",
  stream: "스트림",
  stack: "스택",
  subflow: "하위 흐름",
  suggestion: "제안",
  summary: "요약",
  swipe: "스와이프",
  switcher: "전환기",
  table: "테이블",
  tabs: "탭",
  tag: "태그",
  temporary: "임시",
  terminal: "터미널",
  throttled: "제한 처리",
  toast: "토스트",
  tokenized: "토큰화",
  threshold: "임계값",
  toggle: "전환",
  tool: "도구",
  top: "상단",
  toolbar: "툴바",
  tooltip: "툴팁",
  tray: "트레이",
  tree: "트리",
  transition: "전환",
  types: "유형",
  undo: "되돌리기",
  update: "갱신",
  upload: "업로드",
  validation: "검증",
  variable: "변수",
  view: "보기",
  waterfall: "워터폴",
  weekday: "요일",
  whiteboard: "화이트보드",
  window: "구간",
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
