// ⚠ 데모 · 통합 리소스 — 리소스 종류 인덱스(전체 택소노미) + 종류별 표 + 물리/관계 관점.
// 병합 규칙: 좌측 = 무엇을(종류) · 상단 관점 = 어떻게(물리/관계/목록).
// 워크로드·노드 계열은 관점 전환이 가능하고, 나머지는 종류별 전용 표로 정보를 잃지 않게 표시.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Server, FileCog, Network, Globe, Search, KeyRound,
  Rocket, Database, Boxes, Copy, LayoutGrid, Play, Timer, Plug, DoorOpen, ShieldCheck, MoveDiagonal,
  HardDrive, Cpu, Folder, Activity, UserCog, Eye, Radio, ChevronDown, Pin,
  Home, ListTree, AlertTriangle, Clock, Coins, Settings, Sparkles, PanelLeftClose, PanelLeftOpen,
  Bell, Pencil, Check, Hourglass, Webhook, SignalHigh, Building2, LogOut, RefreshCw,
} from "lucide-react";
import { OpsiaMap, HomeClusterSection } from "./devpreview-opsia";
import { WidgetFrame, RatioBar, Donut, RankList, MultiLine, MiniTimeline } from "./devpreview/widgets";
import { DeploySurface, IssuesSurface, TimelineSurface, ChecksSurface, CostSurface, SettingsSurface, AlertsSurface, AiHistorySurface, IssueDetail, type RcaIncident } from "./devpreview-surfaces";
import { AiPanel } from "./devpreview-ai";
import { onAction, type DemoAction } from "./devpreview/bus";
import { ConnectWizard } from "./devpreview-connect";
import { TopologyView } from "./devpreview-topology";
import { GithubIcon } from "./devpreview/brandIcons";
import { DevpreviewContractProvider, useDevpreviewContracts } from "./devpreview/contracts";
import { activeIncidentClusterIds, useRcaIssues } from "./devpreview/rcaIssuesFeed";
import { useCostOverview } from "./devpreview/costFeed";
import { useSession, sessionInitial } from "./devpreview/sessionFeed";
import { useInventoryNamespaces } from "./devpreview/inventoryNamespacesFeed";
import { useChangeTimeline } from "./devpreview/changeTimelineFeed";
import { useApplications } from "./devpreview/deployFeed";
import { useAlertEvents } from "./devpreview/alertsFeed";
import { useRelationTopology, type RelationNodeView } from "./devpreview/relationTopologyFeed";
import { logout as logoutApi } from "./devpreview/sessionFeed";
import { useInventoryResourcesAcrossClusters, useInventoryKindCounts, kindToResourceType } from "./devpreview/inventoryResourcesFeed";
import { useWorkloadDetail } from "./devpreview/workloadDetailFeed";
import { useResourceUsageSeries } from "./devpreview/resourceUsageFeed";
import { useResourceAccess } from "./devpreview/resourceAccessFeed";
import { ResourceAccessPanel } from "./devpreview/resourceAccessPanel";
import { useNarrowViewport } from "./devpreview/useNarrowViewport";
import { operationalMessageLabel, reasonLabel, statusLabel, isCriticalStatus } from "./devpreview/statusLabel";
import { LiveResourceManifestEditor } from "./devpreview/resourceManifestEditor";
import { podsForNode, useClusterTopology } from "./devpreview/inventoryTopologyFeed";
import { UI, BLUE, BLUE2, HP, TINT, MONO, TYPE, SOFT, SPRING, PRESENT_SCALE, DUR, inkA, blueA, MARK, cardA, GLASS, critA } from "./devpreview/theme";
import "./styles/tokens.css";
import "./styles/foundation.css";


// ── 파생 헬퍼 (가짜 rng/합성 행 제거 — 표는 라이브 인벤토리 계약으로 배선) ──
// nsFor/clusterOf/contractClusterOf 제거: 이름 해싱으로 네임스페이스·클러스터를 지어내던
// 합성 파생을 없앴다. 스코프 필터는 행의 관측된 cluster 필드만 사용하고(없으면 필터하지 않음),
// 상세 진입 fallback은 { name }만 넘긴다(네임스페이스를 이름에서 유추하지 않는다).
// imgFor 합성 이미지 identity 제거 — DetailOverlay가 유일 사용처였고(가짜 이미지 표기),
// 이제 관측된 row.img가 없으면 "관측 안 됨"으로 표기한다.

type Cell = { t: "text" } | { t: "mono" } | { t: "ns" } | { t: "ready" } | { t: "badge"; tone?: "blue" | "green" | "gray" | "purple" }
  | { t: "meter" } | { t: "dots" } | { t: "num" } | { t: "status" };
type Col = { k: string; label: string; w?: string; cell: Cell };
type Row = Record<string, unknown>;

// 종류별 컬럼 정의 — 레퍼런스 표 기준, 캡처 없는 종류는 같은 관점으로 추론
const SPEC: Record<string, { cols: Col[] }> = {
  Deployment: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "ready", label: "READY", w: "72px", cell: { t: "ready" } }, { k: "utd", label: "UP-TO-DATE", w: "96px", cell: { t: "num" } },
      { k: "avail", label: "AVAILABLE", w: "90px", cell: { t: "num" } }, { k: "img", label: "IMAGES", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
  },
  DaemonSet: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "desired", label: "DESIRED", w: "80px", cell: { t: "num" } }, { k: "ready", label: "READY", w: "72px", cell: { t: "ready" } },
      { k: "utd", label: "UP-TO-DATE", w: "96px", cell: { t: "num" } }, { k: "avail", label: "AVAILABLE", w: "90px", cell: { t: "num" } },
      { k: "img", label: "IMAGES", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
  },
  StatefulSet: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "ready", label: "READY", w: "72px", cell: { t: "ready" } }, { k: "utd", label: "UP-TO-DATE", w: "96px", cell: { t: "num" } },
      { k: "img", label: "IMAGES", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
  },
  Pod: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } },
      { k: "ctr", label: "CONTAINERS", w: "92px", cell: { t: "dots" } }, { k: "status", label: "STATUS", w: "92px", cell: { t: "status" } },
      { k: "cpu", label: "CPU", w: "128px", cell: { t: "meter" } }, { k: "mem", label: "MEMORY", w: "128px", cell: { t: "meter" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    // 파드는 맵과 같은 인벤토리에서 파생 — 드릴 맵에 보이는 파드가 곧 이 표의 파드다
    // 정렬도 맵과 동일 규칙: 임계 → 실행 중 → 대기
  },
  ReplicaSet: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.7fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "ready", label: "READY", w: "72px", cell: { t: "ready" } }, { k: "owner", label: "OWNER", w: "minmax(150px,1fr)", cell: { t: "mono" } },
      { k: "st", label: "STATUS", w: "76px", cell: { t: "badge", tone: "blue" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
  },
  Job: {
    cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "170px", cell: { t: "ns" } },
      { k: "st", label: "STATUS", w: "92px", cell: { t: "badge", tone: "blue" } }, { k: "comp", label: "COMPLETIONS", w: "108px", cell: { t: "ready" } },
      { k: "dur", label: "DURATION", w: "84px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
  },
  // 아래 5종은 Kubernetes 표준 출력 컬럼 기준 — 추론이 아니라 정본
  CronJob: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } },
      { k: "sched", label: "SCHEDULE", w: "100px", cell: { t: "mono" } }, { k: "tz", label: "TIMEZONE", w: "92px", cell: { t: "text" } },
      { k: "susp", label: "SUSPEND", w: "78px", cell: { t: "text" } }, { k: "active", label: "ACTIVE", w: "68px", cell: { t: "num" } },
      { k: "last", label: "LAST SCHEDULE", w: "104px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
  },
  Service: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.5fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "type", label: "TYPE", w: "92px", cell: { t: "badge", tone: "blue" } }, { k: "sel", label: "SELECTOR", w: "minmax(140px,1fr)", cell: { t: "mono" } },
      { k: "ep", label: "ENDPOINTS", w: "92px", cell: { t: "badge", tone: "green" } }, { k: "ports", label: "PORTS", w: "120px", cell: { t: "mono" } }, { k: "ext", label: "EXTERNAL", w: "76px", cell: { t: "text" } }],
  },
  Ingress: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.5fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "class", label: "CLASS", w: "96px", cell: { t: "badge", tone: "gray" } }, { k: "hosts", label: "HOSTS", w: "minmax(140px,1fr)", cell: { t: "mono" } },
      { k: "addr", label: "ADDRESS", w: "130px", cell: { t: "mono" } }, { k: "ports", label: "PORTS", w: "80px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    // 외부 노출은 gateway 하나 — 맵의 gateway 서비스(platform)와 일치
  },
  NetworkPolicy: {
    cols: [{ k: "name", label: "NAME", w: "minmax(220px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } },
      { k: "types", label: "TYPES", w: "92px", cell: { t: "text" } }, { k: "sel", label: "POD SELECTOR", w: "minmax(150px,1fr)", cell: { t: "mono" } },
      { k: "rules", label: "RULES", w: "84px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
  },
  EndpointSlice: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "at", label: "ADDRESSTYPE", w: "108px", cell: { t: "badge", tone: "gray" } }, { k: "ports", label: "PORTS", w: "110px", cell: { t: "mono" } },
      { k: "ep", label: "ENDPOINTS", w: "minmax(120px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    // EndpointSlice는 Service마다 1개 — Service 표와 같은 시드로 파생해 이름·포트가 항상 일치
  },
  ConfigMap: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "180px", cell: { t: "ns" } },
      { k: "keys", label: "KEYS", w: "minmax(160px,1fr)", cell: { t: "mono" } }, { k: "size", label: "SIZE", w: "76px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
  },
  Secret: {
    cols: [{ k: "name", label: "NAME", w: "minmax(220px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "type", label: "TYPE", w: "104px", cell: { t: "badge", tone: "purple" } }, { k: "keys", label: "KEYS", w: "72px", cell: { t: "num" } },
      { k: "exp", label: "EXPIRES", w: "84px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
  },
  HPA: {
    cols: [{ k: "name", label: "NAME", w: "minmax(170px,1.5fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } },
      { k: "ref", label: "REFERENCE", w: "minmax(150px,1fr)", cell: { t: "mono" } }, { k: "targets", label: "TARGETS", w: "110px", cell: { t: "mono" } },
      { k: "min", label: "MINPODS", w: "78px", cell: { t: "num" } }, { k: "max", label: "MAXPODS", w: "78px", cell: { t: "num" } },
      { k: "reps", label: "REPLICAS", w: "82px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    // HPA 현재 복제 수·사용률은 파드 인벤토리에서 계산 — 맵의 shop-api 파드 수와 일치
  },
  PVC: {
    cols: [{ k: "name", label: "NAME", w: "minmax(160px,1.4fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "130px", cell: { t: "ns" } },
      { k: "st", label: "STATUS", w: "86px", cell: { t: "badge", tone: "green" } }, { k: "vol", label: "VOLUME", w: "minmax(130px,1fr)", cell: { t: "mono" } },
      { k: "cap", label: "CAPACITY", w: "84px", cell: { t: "text" } }, { k: "am", label: "ACCESS MODES", w: "108px", cell: { t: "mono" } },
      { k: "sc", label: "STORAGECLASS", w: "108px", cell: { t: "badge", tone: "gray" } }, { k: "vac", label: "VOLUMEATTRIBUTESCLASS", w: "150px", cell: { t: "text" } },
      { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
  },
  ClusterRole: {
    cols: [{ k: "name", label: "NAME", w: "minmax(260px,3fr)", cell: { t: "text" } }, { k: "rules", label: "RULES", w: "84px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
  },
  ClusterRoleBinding: {
    cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "role", label: "ROLE", w: "minmax(160px,1.2fr)", cell: { t: "mono" } },
      { k: "subj", label: "SUBJECTS", w: "100px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
  },
  Role: {
    cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "rules", label: "RULES", w: "84px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
  },
  RoleBinding: {
    cols: [{ k: "name", label: "NAME", w: "minmax(220px,2.2fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } },
      { k: "role", label: "ROLE", w: "minmax(150px,1.2fr)", cell: { t: "mono" } }, { k: "subj", label: "SUBJECTS", w: "92px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
  },
  ServiceAccount: {
    cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "auto", label: "AUTOMOUNT", w: "110px", cell: { t: "badge", tone: "gray" } }, { k: "sec", label: "SECRETS", w: "84px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
  },
  Event: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.5fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "120px", cell: { t: "ns" } },
      { k: "type", label: "TYPE", w: "84px", cell: { t: "badge", tone: "green" } }, { k: "reason", label: "REASON", w: "120px", cell: { t: "text" } },
      { k: "msg", label: "MESSAGE", w: "minmax(200px,1.6fr)", cell: { t: "text" } }, { k: "obj", label: "OBJECT", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "cnt", label: "COUNT", w: "64px", cell: { t: "num" } }],
  },
  Namespace: {
    cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "text" } },
      { k: "st", label: "STATUS", w: "92px", cell: { t: "badge", tone: "green" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
  },
  // 추가 종류 — Kubernetes 표준 출력 컬럼
  Endpoints: { cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "160px", cell: { t: "ns" } }, { k: "eps", label: "ENDPOINTS", w: "minmax(160px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], },
  PodDisruptionBudget: { cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } }, { k: "min", label: "MIN AVAILABLE", w: "108px", cell: { t: "mono" } }, { k: "max", label: "MAX UNAVAILABLE", w: "120px", cell: { t: "mono" } }, { k: "dis", label: "ALLOWED DISRUPTIONS", w: "140px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    },
  Lease: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "160px", cell: { t: "ns" } }, { k: "holder", label: "HOLDER", w: "minmax(160px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], },
  MutatingWebhookConfiguration: { cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "hooks", label: "WEBHOOKS", w: "92px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], },
  ValidatingWebhookConfiguration: { cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "hooks", label: "WEBHOOKS", w: "92px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], },
  PriorityClass: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "value", label: "VALUE", w: "110px", cell: { t: "num" } }, { k: "gd", label: "GLOBAL-DEFAULT", w: "120px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], },
  RuntimeClass: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "handler", label: "HANDLER", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], },
  StorageClass: { cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.8fr)", cell: { t: "text" } }, { k: "prov", label: "PROVISIONER", w: "minmax(150px,1fr)", cell: { t: "mono" } }, { k: "rec", label: "RECLAIMPOLICY", w: "114px", cell: { t: "badge", tone: "gray" } }, { k: "vbm", label: "VOLUMEBINDINGMODE", w: "140px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    },
  VolumeAttachment: { cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "att", label: "ATTACHER", w: "minmax(130px,1fr)", cell: { t: "mono" } }, { k: "pv", label: "PV", w: "minmax(130px,1fr)", cell: { t: "mono" } }, { k: "node", label: "NODE", w: "150px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], },
  Application: { cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "120px", cell: { t: "ns" } }, { k: "sync", label: "SYNC", w: "96px", cell: { t: "badge", tone: "green" } }, { k: "health", label: "HEALTH", w: "96px", cell: { t: "badge", tone: "green" } }, { k: "rev", label: "REVISION", w: "100px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    },
  ApplicationSet: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } }, { k: "gens", label: "GENERATORS", w: "110px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    },
  AppProject: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } }, { k: "desc", label: "DESCRIPTION", w: "minmax(150px,1fr)", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    },
  CNINode: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    // CNINode는 클러스터에 조인된 노드마다 1개 — 프로비저닝 중인 노드에는 아직 없다
    },
  APIService: { cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "svc", label: "SERVICE", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "avail", label: "AVAILABLE", w: "96px", cell: { t: "badge", tone: "green" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    },
  Node: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.6fr)", cell: { t: "text" } }, { k: "st", label: "STATUS", w: "96px", cell: { t: "status" } },
      { k: "inst", label: "INSTANCE", w: "96px", cell: { t: "mono" } }, { k: "cpu", label: "CPU", w: "150px", cell: { t: "meter" } },
      { k: "mem", label: "MEMORY", w: "150px", cell: { t: "meter" } }, { k: "pods", label: "PODS", w: "140px", cell: { t: "meter" } }, { k: "zone", label: "ZONE", w: "76px", cell: { t: "mono" } }],
    // 노드도 맵과 같은 인벤토리 — 맵의 노드 카드와 이 표의 행이 1:1, 정렬도 동일 규칙(가동→예약→차단)
  },
};

// ── 종류 인덱스 (레퍼런스 구조 그대로) ─────────────────────────────
type Kind = { id: string; label: string; icon: typeof Rocket; group: string };
// 그룹·종류·개수는 계약 fixture의 관측 인벤토리와 같은 분류를 사용한다.
const GROUPS = ["워크로드", "네트워킹", "구성", "스토리지", "접근 제어", "클러스터", "ARGO", "AWS VPC CNI", "API 등록"] as const;
const BASE_KINDS: Kind[] = [
  { id: "CronJob", label: "CronJob", icon: Timer, group: "워크로드" },
  { id: "DaemonSet", label: "DaemonSet", icon: LayoutGrid, group: "워크로드" },
  { id: "Deployment", label: "Deployment", icon: Rocket, group: "워크로드" },
  { id: "Job", label: "Job", icon: Play, group: "워크로드" },
  { id: "Pod", label: "Pod", icon: Boxes, group: "워크로드" },
  { id: "ReplicaSet", label: "ReplicaSet", icon: Copy, group: "워크로드" },
  { id: "StatefulSet", label: "StatefulSet", icon: Database, group: "워크로드" },
  { id: "Endpoints", label: "Endpoints", icon: Radio, group: "네트워킹" },
  { id: "EndpointSlice", label: "EndpointSlice", icon: Radio, group: "네트워킹" },
  { id: "Ingress", label: "Ingress", icon: DoorOpen, group: "네트워킹" },
  { id: "NetworkPolicy", label: "NetworkPolicy", icon: ShieldCheck, group: "네트워킹" },
  { id: "Service", label: "Service", icon: Plug, group: "네트워킹" },
  { id: "ConfigMap", label: "ConfigMap", icon: FileCog, group: "구성" },
  { id: "HPA", label: "HorizontalPodAutoscaler", icon: MoveDiagonal, group: "구성" },
  { id: "Lease", label: "Lease", icon: Hourglass, group: "구성" },
  { id: "MutatingWebhookConfiguration", label: "MutatingWebhookConfiguration", icon: Webhook, group: "구성" },
  { id: "PodDisruptionBudget", label: "PodDisruptionBudget", icon: ShieldCheck, group: "구성" },
  { id: "PriorityClass", label: "PriorityClass", icon: SignalHigh, group: "구성" },
  { id: "RuntimeClass", label: "RuntimeClass", icon: Cpu, group: "구성" },
  { id: "Secret", label: "Secret", icon: KeyRound, group: "구성" },
  { id: "ValidatingWebhookConfiguration", label: "ValidatingWebhookConfiguration", icon: Webhook, group: "구성" },
  { id: "PVC", label: "PersistentVolumeClaim", icon: HardDrive, group: "스토리지" },
  { id: "StorageClass", label: "StorageClass", icon: HardDrive, group: "스토리지" },
  { id: "VolumeAttachment", label: "VolumeAttachment", icon: HardDrive, group: "스토리지" },
  { id: "ClusterRole", label: "ClusterRole", icon: ShieldCheck, group: "접근 제어" },
  { id: "ClusterRoleBinding", label: "ClusterRoleBinding", icon: ShieldCheck, group: "접근 제어" },
  { id: "Role", label: "Role", icon: ShieldCheck, group: "접근 제어" },
  { id: "RoleBinding", label: "RoleBinding", icon: ShieldCheck, group: "접근 제어" },
  { id: "ServiceAccount", label: "ServiceAccount", icon: UserCog, group: "접근 제어" },
  { id: "Event", label: "Event", icon: Activity, group: "클러스터" },
  { id: "Namespace", label: "Namespace", icon: Folder, group: "클러스터" },
  { id: "Node", label: "Node", icon: Cpu, group: "클러스터" },
  { id: "Application", label: "Application", icon: Rocket, group: "ARGO" },
  { id: "ApplicationSet", label: "ApplicationSet", icon: Copy, group: "ARGO" },
  { id: "AppProject", label: "AppProject", icon: Folder, group: "ARGO" },
  { id: "CNINode", label: "CNINode", icon: Network, group: "AWS VPC CNI" },
  { id: "APIService", label: "APIService", icon: Plug, group: "API 등록" },
];
// 사이드바 카운트는 라이브 인벤토리 요약에서 파생(useInventoryKindCounts) —
// 모듈 로드 시 가짜 count를 만들지 않는다. 렌더 시점에 counts 맵을 주입한다.
const KINDS: Kind[] = BASE_KINDS;
const GROUP_TOTAL = (g: string, counts: Record<string, number>) =>
  KINDS.filter((k) => k.group === g).reduce((s, k) => s + (counts[k.id] ?? 0), 0);

// ── 셀 렌더러 ─────────────────────────────
function CellView({ cell, v, bad }: { cell: Cell; v: unknown; bad?: boolean }) {
  // 계약이 노출하지 않는 필드는 값이 없다 — "undefined"/NaN 대신 관측 안 됨("–")을 낸다.
  if (v === undefined || v === null || v === "") {
    return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>–</span>;
  }
  if (cell.t === "meter") {
    const m = v as { used: string; lim: string; pct: number };
    const c = m.pct >= 90 ? HP.crit : m.pct >= 60 ? HP.warn : HP.ok;
    return (
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: TYPE.caption2, fontFamily: MONO, color: UI.ink2, whiteSpace: "nowrap" }}>{m.used} / {m.lim} <span style={{ color: UI.ink3 }}>{m.pct}%</span></span>
        <span style={{ height: 3, borderRadius: 999, background: inkA(0.07), overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${m.pct}%`, background: c, borderRadius: 999 }} />
        </span>
      </span>
    );
  }
  if (cell.t === "dots") {
    const n = v as number;
    return <span style={{ display: "flex", gap: 3 }}>{Array.from({ length: n }).map((_, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 999, background: bad && i === 0 ? HP.crit : i === 0 && n > 1 ? HP.pending : HP.ok }} />)}</span>;
  }
  if (cell.t === "ready") return <span style={{ fontSize: TYPE.label, fontFamily: MONO, fontWeight: 600, color: bad ? HP.crit : TINT.ok.fg }}>{String(v)}</span>;
  if (cell.t === "status") {
    const s = String(v);
    const tone = bad || isCriticalStatus(s) || /Crash|OOM|Fail|Error|Evict/.test(s) ? "red" : /Pending|Provisioning/.test(s) ? "blue" : /Cordoned|Suspend|Terminat/.test(s) ? "gray" : "green";
    return <Badge text={statusLabel(s)} tone={tone} />;
  }
  if (cell.t === "badge") return <Badge text={statusLabel(String(v))} tone={bad ? "red" : cell.tone ?? "gray"} />;
  if (cell.t === "num") return <span style={{ fontSize: TYPE.label2, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: UI.ink2 }}>{String(v)}</span>;
  if (cell.t === "ns") return <span style={{ fontSize: TYPE.label2, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v)}</span>;
  if (cell.t === "mono") return <span style={{ fontSize: TYPE.label, fontFamily: MONO, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v)}</span>;
  return <span style={{ fontSize: TYPE.label2, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v)}</span>;
}
function Badge({ text, tone }: { text: string; tone: "blue" | "green" | "gray" | "purple" | "red" }) {
  const S = { blue: [TINT.blue.fg, TINT.blue.bg, TINT.blue.bd], green: [TINT.ok.fg, TINT.ok.bg, TINT.ok.bd], gray: [UI.ink2, TINT.gray.bg, TINT.gray.bd], purple: [TINT.purple.fg, TINT.purple.bg, TINT.purple.bd], red: [TINT.crit.fg, TINT.crit.bg, TINT.crit.bd] }[tone];
  return <span style={{ display: "inline-block", fontSize: TYPE.caption, fontWeight: 600, color: S[0], background: S[1], border: `1px solid ${S[2]}`, borderRadius: 5, padding: "1.5px 7px", whiteSpace: "nowrap" }}>{text}</span>;
}

// ── 종류별 표 ─────────────────────────────
// 검색어 매치 하이라이트 — 무엇이 걸렸는지 눈으로 바로 보인다
function Hi({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<span style={{ background: MARK, borderRadius: 3, padding: "0 1px" }}>{text.slice(i, i + q.length)}</span>{text.slice(i + q.length)}</>;
}

function ResourceTable({ kind, rows, q, filterDesc = "", onClearFilter, onOpen }: { kind: Kind; rows: Row[]; q: string; filterDesc?: string; onClearFilter?: () => void; onOpen: (r: Row) => void }) {
  const spec = SPEC[kind.id];
  if (!spec) return null;
  const filtered = rows;
  /* 가로 스크롤 금지 — 고정폭 컬럼을 minmax로 감싸 컨테이너에 항상 맞춘다 */
  const grid = spec.cols.map((c) => { const w = c.w ?? "1fr"; return w.endsWith("px") ? `minmax(48px, ${w})` : w; }).join(" ");
  // 밀도 토글 제거(P1) — 엔터프라이즈 밀도의 단일 행 높이로 고정한다.
  const rowPad = "7px 16px";
  return (
    /* 긴 표는 카드 안에서 세로 스크롤(헤더 고정) */
    <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, overflowY: "auto", overflowX: "hidden", maxHeight: `min(calc(64vh / ${PRESENT_SCALE}), 680px)`, scrollbarGutter: "stable" }}>
    <div>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 14, padding: "10px 16px", borderBottom: `1px solid ${UI.line}`, background: UI.bg2, position: "sticky", top: 0, zIndex: 2 }}>
        {/* 정렬 미구현 — 동작 없는 정렬 셰브론을 그리지 않는다(가짜 컨트롤 금지) */}
        {spec.cols.map((c) => (
          <span key={c.k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.05em", color: UI.ink3 }}>
            {c.label}
          </span>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: "40px 18px", textAlign: "center", fontSize: TYPE.body, color: UI.ink3 }}>
          <span>{q ? `"${q}" 검색 결과가 없습니다` : `${filterDesc} ${kind.label} 리소스가 없습니다`}</span>
          {onClearFilter && (q || filterDesc) ? (
            <button onClick={onClearFilter} style={{ display: "block", margin: "10px auto 0", border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "5px 12px", fontSize: TYPE.label, fontWeight: 600, color: BLUE, cursor: "pointer" }}>필터 해제</button>
          ) : null}
        </div>
      ) : filtered.map((row, i) => (
        <motion.div key={`${kind.id}-${String(row.cluster ?? "")}-${String(row._key ?? row.name)}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: Math.min(i, 10) * 0.022 }}
          className="rrow" onClick={() => onOpen(row)} style={{ display: "grid", gridTemplateColumns: grid, gap: 14, alignItems: "center", padding: rowPad, borderTop: i ? `1px solid ${UI.line2}` : "none", cursor: "pointer" }}>
          {spec.cols.map((c, ci) => (
            <span key={c.k} style={{ minWidth: 0, fontWeight: ci === 0 ? 600 : 400, color: ci === 0 ? UI.ink : undefined, fontSize: ci === 0 ? 12 : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: ci === 0 ? "nowrap" : undefined }}>
              {ci === 0 ? <Hi text={String(row[c.k] ?? "")} q={q} /> : <CellView cell={c.cell} v={row[c.k]} bad={row.bad as boolean} />}
            </span>
          ))}
        </motion.div>
      ))}
    </div>
    </div>
  );
}

// ── 상세 오버레이 (최상위 레이어) ─────────────────────────────
// 탭 구성은 리소스 상세 드로어 기준: 개요 · YAML · 관련 리소스 · 이벤트 · 로그 · 권한(RBAC)
const DETAIL_TABS = [
  { id: "overview", label: "개요" }, { id: "yaml", label: "YAML" }, { id: "events", label: "이벤트" }, { id: "logs", label: "로그" }, { id: "rbac", label: "권한" },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]["id"];
const TABS_FOR = (kindId: string): DetailTab[] => {
  if (kindId === "Pod") return ["overview", "yaml", "events", "logs", "rbac"];
  if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"].includes(kindId)) return ["overview", "yaml", "events", "logs", "rbac"];
  if (["ServiceAccount", "Role", "ClusterRole", "RoleBinding", "ClusterRoleBinding"].includes(kindId)) return ["overview", "yaml", "rbac"];
  if (kindId === "Node") return ["overview", "yaml", "events"];
  return ["overview", "yaml", "events"];
};

// 섹션 래퍼 — 접기 가능한 리소스 상세 드로어 구조
function Sec({ title, icon: I, right, children, defaultOpen = true }: { title: string; icon?: typeof Rocket; right?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ borderBottom: `1px solid ${UI.line2}`, padding: "14px 0" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", border: "none", background: "transparent", cursor: "pointer", padding: 0, marginBottom: open ? 10 : 0 }}>
        <ChevronDown size={12} style={{ color: UI.ink3, transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
        {I && <I size={12} style={{ color: UI.ink3 }} />}
        <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink }}>{title}</span>
        <span style={{ marginLeft: "auto" }}>{right}</span>
      </button>
      {open && children}
    </section>
  );
}
// Chip 제거 — 합성 레이블/RBAC 규칙 칩을 렌더하던 DetailOverlay 섹션이 "관측 안 됨"으로 바뀌며 미사용.

function KV({ k, v, mono, tone }: { k: string; v: string; mono?: boolean; tone?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "132px 1fr", gap: 12, padding: "7px 0", borderBottom: `1px solid ${UI.line2}` }}>
      <span style={{ fontSize: TYPE.label, color: UI.ink3 }}>{k}</span>
      <span style={{ fontSize: TYPE.label2, color: tone ?? UI.ink, fontFamily: mono ? MONO : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
}

// 관측 계약이 없는 섹션의 일관된 빈 상태 — 지어내지 않고 정직하게 비운다(원본의 깔끔한 empty-state 톤).
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px dashed ${UI.line}`, background: UI.bg2, borderRadius: 10, padding: "10px 12px", fontSize: TYPE.label, color: UI.ink3, lineHeight: 1.5 }}>
      <Eye size={13} style={{ color: UI.ink3, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );
}


// RelGraph/TINT_G 제거 — 합성 소유·참조 관계도(rs/deploy/svc/pod/cm/netpol 이름 지어내기)를
// 렌더하던 DetailOverlay '관련 리소스' 섹션이 "관측 안 됨"으로 바뀌며 미사용.
// NS_OPTIONS 하드코딩 목록 제거 — 네임스페이스 셀렉트는 useInventoryNamespaces 관측 네임스페이스로 구동.

const TOPBAR_H = 57; // 상단 크롬 높이 — 오버레이는 이 아래부터 시작한다

// UsageMiniChart(M14) — 관측된 사용량 시계열만 그린다. null 표본(미관측)에서는
// 선을 끊어 gap을 정직하게 표시하고, 값 자체를 보간·합성하지 않는다.
function UsageMiniChart({ title, unit, values, observed, total }: { title: string; unit: string; values: (number | null)[]; observed: number; total: number }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const range = max - min || 1;
  const W = 240, H = 44;
  const n = values.length;
  const px = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const py = (v: number) => H - ((v - min) / range) * H;
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${px(i).toFixed(1)} ${py(v).toFixed(1)} `;
    pen = true;
  });
  const last = [...values].reverse().find((v): v is number => v !== null);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: TYPE.label2, fontWeight: 700, color: UI.ink2 }}>{title}</span>
        {last !== undefined && <span style={{ fontSize: TYPE.label2, fontFamily: MONO, color: UI.ink }}>{last.toFixed(0)} {unit}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={44} style={{ display: "block", overflow: "visible" }} role="img" aria-label={`${title} 사용량 추이`}>
        <path d={d.trim()} fill="none" stroke={BLUE} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: TYPE.micro, color: UI.ink3 }}>
        <span>표본 {observed}/{total}{observed < total ? " · 부분 관측" : ""}</span>
        <span>최대 {max.toFixed(0)} · 최소 {min.toFixed(0)} {unit}</span>
      </div>
    </div>
  );
}
// RetryNote — 일시적 오류(요청 실패)를 "관측 안 됨(데이터 없음)"과 구분해 표시하고
// 재조회 버튼을 제공한다. 오류를 unavailable로 위장하지 않는다(M13/M14/M16).
function RetryNote({ onRetry, label }: { onRetry: () => void; label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", flexWrap: "wrap" }}>
      <span style={{ fontSize: TYPE.label, color: UI.ink3 }}>{label ?? "일시적 오류로 관측값을 불러오지 못했습니다."}</span>
      <button type="button" onClick={onRetry} style={{ border: `1px solid ${UI.line}`, background: UI.card, color: BLUE, borderRadius: 8, padding: "5px 11px", fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>다시 시도</button>
    </div>
  );
}

// hlYaml/YAML_FONT 제거 — 합성 YAML 매니페스트를 렌더하던 DetailOverlay YAML 탭이
// 관측 전용("관측 안 됨")으로 바뀌면서 더 이상 쓰이지 않는다.

function DetailOverlay({ kind, row, onClose, onOpenRef: _onOpenRef, onShowPods, forceFull = false, rightInset = 0, leftInset = 0, topInset = TOPBAR_H, viewportW = 1280 }: { kind: Kind; row: Row; onClose: () => void; onToast?: (t: { title: string; sub: string; tone: "ok" | "crit" }) => void; onOpenRef?: (kindId: string, name: string) => void; onShowPods?: (base: string) => void; forceFull?: boolean; rightInset?: number; leftInset?: number; topInset?: number; viewportW?: number }) {
  const tabs = TABS_FOR(kind.id);
  const [tab, setTab] = useState<DetailTab>(tabs[0]);
  const [fullSelf, setFull] = useState(false);   // 전체 화면 (원본 레퍼런스의 ⤢)
  const full = forceFull || fullSelf;            // AI 대화창이 열리면 자연스럽게 전체 화면으로
  const name = String(row.name ?? "");
  const ns = String(row.ns ?? "–");
  const bad = !!row.bad;
  // 관측된 상태/헬스/클러스터만 표시 — 노드명·호스트/파드 IP·QoS·소유관계는 라이브 인벤토리 계약에 없어 지어내지 않는다.
  const phase = row.status != null && String(row.status) ? statusLabel(String(row.status)) : "관측 안 됨";
  const healthVal = row.health != null && String(row.health) ? statusLabel(String(row.health)) : "관측 안 됨";
  const clusterVal = row.cluster != null && String(row.cluster) ? String(row.cluster) : "관측 안 됨";
  const resourceId = row._key != null ? String(row._key) : "";
  // M13: 워크로드 상세는 `GET /api/workloads/{kind}/{ns}/{name}`로 실제 replicas·health·
  // labels·pods를 관측한다(이전 "계약 없음" 오판 교정). 미지원 kind/빈 스코프는 idle이라
  // 기존 honest 일반 뷰가 그대로 유지된다.
  const wd = useWorkloadDetail(
    row.cluster != null && String(row.cluster) ? String(row.cluster) : null,
    kind.id,
    row.ns != null && String(row.ns) ? String(row.ns) : null,
    name,
  );
  // M14: 파드 상세는 `GET /api/clusters/{id}/usage`에서 관측된 CPU/메모리 시계열을
  // 차트로 표시한다. 파드가 아니거나 스코프가 비면 idle이라 요청하지 않는다.
  const isPodKind = kind.id === "Pod";
  const usage = useResourceUsageSeries(
    isPodKind && row.cluster != null && String(row.cluster) ? String(row.cluster) : null,
    "pod",
    isPodKind && row.ns != null && String(row.ns) ? String(row.ns) : null,
    isPodKind ? name : "",
  );
  // M18: 실제 retained RBAC reverse-index 계약. ServiceAccount/Role은 정확한 주체·역할을,
  // 워크로드·파드는 리소스별 권한으로 꾸미지 않고 해당 네임스페이스 요약을 조회한다.
  const access = useResourceAccess(
    tabs.includes("rbac") && row.cluster != null && String(row.cluster) ? String(row.cluster) : null,
    kind.id,
    row.ns != null && String(row.ns) ? String(row.ns) : null,
    name,
  );
  // 드로어 폭 — 왼쪽 가장자리 드래그로 조절 (전체 화면일 땐 비활성)
  const [dw, setDw] = useState(560);
  const [dwDragging, setDwDragging] = useState(false);
  const onEdgeDown = (e: React.PointerEvent) => {
    if (full) return;
    e.preventDefault(); setDwDragging(true);
    const move = (ev: PointerEvent) => { const cssW = document.documentElement.clientWidth / PRESENT_SCALE; setDw(Math.min(cssW - leftInset - 40, Math.max(460, cssW - ev.clientX / PRESENT_SCALE))); };
    const up = () => { setDwDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  // 재시작/스케일처럼 이 드로어가 지원하지 않는 변경 컨트롤은 노출하지 않는다.
  // YAML 변경은 source/content SHA를 고정하고 권한·CSRF·감사 계약을 거치는 전용 편집기에서만 수행한다.
  const isWorkload = ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"].includes(kind.id);
  const isPod = kind.id === "Pod";
  const wp = isWorkload || isPod;                 // 워크로드·파드 전용 섹션
  // 합성 YAML은 만들지 않는다. 실제 인벤토리 key로 원본을 조회하고, 원본이 없는 리소스는
  // Git 바인딩 누락 상태를 명시해 잘못된 매니페스트를 편집·적용하지 않도록 한다.

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: DUR.fade }}
        aria-hidden="true" onClick={onClose} style={{ position: "fixed", top: topInset, right: 0, bottom: 0, left: leftInset, background: inkA(0.07), zIndex: 70 }} />
      {/* 닫기 즉시 반응 — 열림은 스프링, 닫힘은 짧은 ease-in으로 지연 없이 사라진다(P1-12) */}
      <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }} transition={{ type: "spring", bounce: 0.06, visualDuration: 0.36 }}
        style={{ position: "fixed", top: topInset, right: 0, bottom: 0,
          /* 상단바·사이드바·서브사이드바는 덮지 않는다 — 콘텐츠 영역만 */
          width: full ? viewportW - leftInset : dw, maxWidth: viewportW - leftInset,
          background: UI.card, borderLeft: `1px solid ${UI.line}`, zIndex: 71, display: "flex", flexDirection: "column", boxShadow: `-24px 0 60px -30px ${inkA(0.3)}`, transition: dwDragging ? "none" : "width .28s cubic-bezier(.32,.72,0,1), padding-right .28s cubic-bezier(.32,.72,0,1)", paddingRight: full ? rightInset : 0, boxSizing: "border-box" }}>
        {/* 좌측 가장자리 리사이즈 핸들 */}
        {!full && (
          <div onPointerDown={onEdgeDown} title="드래그해서 폭 조절"
            style={{ position: "absolute", left: -2, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 5, background: dwDragging ? blueA(0.35) : "transparent", transition: "background .15s" }} />
        )}
        {/* 헤더 */}
        <div style={{ padding: "16px 20px 0", borderBottom: `1px solid ${UI.line}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: blueA(0.09), display: "grid", placeItems: "center", flexShrink: 0 }}>
              <kind.icon size={15} style={{ color: BLUE }} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: TYPE.title3, fontWeight: 700, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
              <div style={{ fontSize: TYPE.label, color: UI.ink3, marginTop: 2 }}>{kind.label} · {ns}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span title="YAML 탭에서 실제 Git 소스·권한·에이전트 적용 가능성을 확인합니다" style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${UI.line}`, background: UI.bg2, borderRadius: 8, padding: "5px 10px", fontSize: TYPE.label, fontWeight: 600, color: UI.ink3 }}>
                소스·권한 검증
              </span>
              <button type="button" aria-label={forceFull ? "AI 대화 중에는 전체 화면 유지" : full ? "상세 패널 축소" : "상세 패널 전체 화면"} title={forceFull ? "AI 대화 중에는 전체 화면 유지" : full ? "패널로 축소" : "전체 화면"} disabled={forceFull} onClick={() => setFull(!fullSelf)} style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: inkA(0.06), color: UI.ink3, cursor: forceFull ? "default" : "pointer", opacity: forceFull ? 0.4 : 1, fontSize: TYPE.label, lineHeight: 1 }}>{full ? "⤡" : "⤢"}</button>
              <button type="button" aria-label="상세 패널 닫기" onClick={onClose} style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: inkA(0.06), color: UI.ink3, cursor: "pointer", fontSize: TYPE.body, lineHeight: 1 }}>✕</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, marginTop: 14 }}>
            {tabs.map((t) => {
              const on = tab === t;
              const label = DETAIL_TABS.find((d) => d.id === t)!.label;
              return (
                <button type="button" role="tab" aria-selected={on} key={t} onClick={() => setTab(t)} style={{ position: "relative", border: "none", background: "transparent", cursor: "pointer", padding: "8px 12px 10px", fontSize: TYPE.body, fontWeight: on ? 700 : 500, color: on ? UI.ink : UI.ink3 }}>
                  {label}
                  {on && <motion.span layoutId="dtab" transition={SOFT} style={{ position: "absolute", left: 8, right: 8, bottom: 0, height: 2, borderRadius: 2, background: BLUE }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 28px" }}>
        <div style={{ maxWidth: full ? 880 : "none", margin: full ? "0 auto" : 0 }}>
          {tab === "overview" && (
            <div>
              {/* 운영 이슈 */}
              {bad && (
                <Sec title="운영 이슈" icon={Activity}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${TINT.crit.bd}`, background: TINT.crit.bg, borderRadius: 10, padding: "10px 12px" }}>
                    <Badge text={statusLabel("critical")} tone="red" />
                    <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink }}>{phase}</span>
                    <span style={{ fontSize: TYPE.label, color: UI.ink2 }}>관측된 상태 · 상세 원인은 이 리소스의 계약에 없습니다</span>
                  </div>
                </Sec>
              )}

              {/* 상태 */}
              <Sec title="상태" icon={Activity}>
                {isWorkload
                  ? (() => {
                      // 관측된 값만 표기: loading은 "불러오는 중…", 값 없음/미관측은 "관측 안 됨".
                      const rep = wd.replicas;
                      const cell = (v: number | null | undefined) =>
                        wd.status === "loading" ? "불러오는 중…" : v != null ? String(v) : "관측 안 됨";
                      const wHealth = wd.status === "loading"
                        ? "불러오는 중…"
                        : wd.health != null && String(wd.health) ? statusLabel(String(wd.health)) : healthVal;
                      return ([
                        ["헬스", wHealth],
                        ["클러스터", clusterVal],
                        ["목표 복제본", cell(rep?.desired)],
                        ["준비된 복제본", cell(rep?.ready)],
                        ["가용 복제본", cell(rep?.available)],
                        ["최신 복제본", cell(rep?.updated)],
                        ["비가용 복제본", cell(rep?.unavailable)],
                      ] as const).map(([k, v]) => (
                        <KV key={k} k={k} v={v} mono tone={k === "헬스" && v !== "관측 안 됨" && v !== "불러오는 중…" ? (bad ? TINT.crit.fg : TINT.ok.fg) : undefined} />
                      ));
                    })()
                  : ([["상태", phase], ["헬스", healthVal], ["클러스터", clusterVal], ["노드", "관측 안 됨"], ["파드 IP", "관측 안 됨"], ["호스트 IP", "관측 안 됨"], ["QoS 클래스", "관측 안 됨"], ["ServiceAccount", "관측 안 됨"]] as const).map(([k, v]) => <KV key={k} k={k} v={v} mono tone={k === "상태" ? (bad ? TINT.crit.fg : v === "관측 안 됨" ? undefined : TINT.ok.fg) : undefined} />)}
                {isWorkload && wd.coverageAvailability === "partial" && (
                  <div style={{ fontSize: TYPE.caption2, color: UI.ink3, marginTop: 8 }}>일부 범위만 관측된 부분 스냅샷입니다.</div>
                )}
                {isWorkload && wd.status === "error" && <RetryNote onRetry={wd.retry} label="상세 관측값을 불러오지 못했습니다." />}
                <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
                  {isWorkload && <button onClick={onShowPods ? () => onShowPods(name) : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "6px 11px", fontSize: TYPE.label2, fontWeight: 600, color: BLUE, cursor: "pointer" }}><Boxes size={12} />관리 중인 파드 보기</button>}
                </div>
              </Sec>

              {/* 전략 (워크로드) — 라이브 인벤토리 계약은 배포 전략을 노출하지 않는다 */}
              {isWorkload && (
                <Sec title="전략">
                  <KV k="업데이트 전략" v="관측 안 됨" />
                </Sec>
              )}

              {/* 파드 템플릿 / 컨테이너 (워크로드·파드) — 이미지·포트는 계약에 없어 지어내지 않는다 */}
              {wp && (
              <Sec title={isWorkload ? "파드 템플릿" : "컨테이너"} icon={Boxes}>
                <div style={{ border: `1px solid ${UI.line2}`, background: UI.bg2, borderRadius: 10, padding: "11px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: TYPE.body, fontWeight: 700, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                  </div>
                  <div style={{ fontSize: TYPE.caption2, color: UI.ink3, marginTop: 4 }}>이미지 관측 안 됨</div>
                  <div style={{ fontSize: TYPE.caption2, color: UI.ink3, marginTop: 3 }}>포트 관측 안 됨</div>
                </div>
              </Sec>
              )}

              {/* 환경 변수 (파드 전용) — 계약이 컨테이너 환경 변수를 노출하지 않는다 */}
              {isPod && (
                <Sec title="환경 변수" defaultOpen={false}>
                  <Empty>관측 안 됨 — 라이브 인벤토리 계약은 컨테이너 환경 변수를 노출하지 않습니다.</Empty>
                </Sec>
              )}

              {/* 컨디션 (워크로드·파드) — 계약이 컨디션을 노출하지 않는다 */}
              {wp && (
              <Sec title="컨디션">
                <Empty>관측 안 됨 — 이 리소스의 컨디션 계약이 없습니다.</Empty>
              </Sec>
              )}

              {/* 권한 (워크로드·파드) — 계약이 ServiceAccount·RBAC를 노출하지 않는다 */}
              {wp && (
              <Sec title="ServiceAccount 권한" icon={ShieldCheck}>
                <Empty>관측 안 됨 — 라이브 인벤토리 계약은 ServiceAccount·RBAC 정보를 노출하지 않습니다.</Empty>
              </Sec>
              )}

              {/* 앱 정보 (워크로드·파드) — 관측된 리소스 정체성만 표시 */}
              {wp && (
              <Sec title="앱 정보" icon={Folder}>
                <KV k="이름" v={name} mono /><KV k="종류" v={kind.label} mono /><KV k="네임스페이스" v={ns} mono /><KV k="클러스터" v={clusterVal} mono />
              </Sec>
              )}

              {/* 메트릭(M14) — 파드는 관측된 CPU/메모리 시계열을 차트로, 워크로드는 파드 단위 관측 안내 */}
              {isPod && (
              <Sec title="메트릭" icon={Activity}>
                {usage.status === "loading" ? <Empty>불러오는 중…</Empty>
                  : usage.status === "error" ? <RetryNote onRetry={usage.retry} label="메트릭을 불러오지 못했습니다." />
                  : usage.status === "unavailable" ? <Empty>메트릭 관측 안 됨 — 이 파드의 관측 사용량 표본이 없습니다.</Empty>
                  : usage.status === "ready" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {usage.hasMemory
                        ? <UsageMiniChart title="메모리" unit="MiB" values={usage.points.map((p) => p.memMib)} observed={usage.memObserved} total={usage.sampleCount} />
                        : <KV k="메모리" v="관측 안 됨" mono />}
                      {usage.hasCpu
                        ? <UsageMiniChart title="CPU" unit="mcores" values={usage.points.map((p) => p.cpuMcores)} observed={usage.cpuObserved} total={usage.sampleCount} />
                        : <KV k="CPU" v="관측 안 됨 — 이 환경은 실사용 CPU를 표본화하지 않습니다" mono />}
                    </div>
                  ) : <Empty>메트릭 관측 안 됨</Empty>}
              </Sec>
              )}
              {isWorkload && (
              <Sec title="메트릭" icon={Activity}>
                <Empty>메트릭은 관리 파드 단위로 관측됩니다 — 위 “관리 중인 파드 보기”에서 개별 파드의 사용량을 확인하세요.</Empty>
              </Sec>
              )}

              {/* 데이터 (ConfigMap·Secret) — 계약이 데이터 항목을 노출하지 않는다 */}
              {(kind.id === "ConfigMap" || kind.id === "Secret") && (
                <Sec title="데이터" icon={FileCog}>
                  <Empty>관측 안 됨 — 라이브 인벤토리 계약은 {kind.id === "Secret" ? "Secret" : "ConfigMap"} 데이터를 노출하지 않습니다.</Empty>
                </Sec>
              )}

              {/* 관련 리소스 — 워크로드는 관측된 관리 파드를 표시, 그 외 kind는 계약에 없어 honest 빈상태 */}
              <Sec title="관련 리소스" icon={Copy}>
                {wd.status === "idle" ? <Empty>관측 안 됨 — 라이브 인벤토리 계약은 리소스 간 소유·참조 관계를 노출하지 않습니다.</Empty>
                  : wd.status === "loading" ? <Empty>불러오는 중…</Empty>
                  : wd.status === "error" ? <RetryNote onRetry={wd.retry} label="관리 파드를 불러오지 못했습니다." />
                  : wd.status === "unavailable" ? <Empty>관리 파드가 관측되지 않았습니다.</Empty>
                  : wd.pods.length === 0 ? <Empty>관측된 관리 파드가 없습니다.{wd.podsExcludedCount > 0 ? ` (수집 한도로 ${wd.podsExcludedCount}개 생략)` : ""}</Empty>
                  : (<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {wd.pods.map((p) => (
                        <div key={`${p.namespace ?? ""}/${p.name}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${UI.line2}`, background: UI.bg2, borderRadius: 8, padding: "7px 11px" }}>
                          <span style={{ fontSize: TYPE.caption2, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                          <span style={{ fontSize: TYPE.caption2, color: UI.ink3, flexShrink: 0 }}>{statusLabel(p.health)}</span>
                        </div>
                      ))}
                      {wd.podsExcludedCount > 0 && <div style={{ fontSize: TYPE.caption2, color: UI.ink3 }}>수집 한도로 {wd.podsExcludedCount}개 생략됨</div>}
                    </div>)}
              </Sec>

              {/* 최근 이벤트(M16) — 워크로드는 관측 이벤트를 표시, 그 외 kind는 honest 빈상태 */}
              <Sec title="최근 이벤트" icon={Activity}>
                {wd.status === "idle" ? <Empty>관측 안 됨 — 이 리소스의 이벤트 계약이 없습니다.</Empty>
                  : wd.status === "loading" ? <Empty>불러오는 중…</Empty>
                  : wd.status === "error" ? <RetryNote onRetry={wd.retry} label="이벤트를 불러오지 못했습니다." />
                  : wd.events.length === 0 ? <Empty>최근 관측된 이벤트가 없습니다.</Empty>
                  : (<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {wd.events.map((e, i) => (
                        <div key={`${e.reason ?? "ev"}-${i}`} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, border: `1px solid ${UI.line2}`, background: UI.bg2, borderRadius: 8, padding: "7px 11px" }}>
                          <span style={{ fontSize: TYPE.caption2, color: UI.ink }}>{statusLabel(e.reason)}{e.type ? ` · ${statusLabel(e.type)}` : ""}{e.count != null && e.count > 1 ? ` ×${e.count}` : ""}</span>
                          {e.lastAt && <span style={{ fontSize: TYPE.caption2, color: UI.ink3, flexShrink: 0 }}>{e.lastAt.replace("T", " ").slice(0, 16)}</span>}
                        </div>
                      ))}
                    </div>)}
              </Sec>

              {/* 레이블(M13) — 워크로드는 관측 레이블을 표시, 그 외 kind는 계약에 없어 honest 빈상태 */}
              <Sec title="레이블">
                {wd.status === "ready" && wd.labels.length > 0
                  ? (<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {wd.labels.map((l) => (
                        <span key={l.key} style={{ fontSize: TYPE.micro, fontFamily: MONO, color: UI.ink2, border: `1px solid ${UI.line2}`, background: UI.bg2, borderRadius: 6, padding: "3px 7px" }}>{l.key}{l.value ? `=${l.value}` : ""}</span>
                      ))}
                    </div>)
                  : wd.status === "ready" && wd.labels.length === 0 ? <Empty>관측된 레이블이 없습니다.</Empty>
                  : wd.status === "loading" ? <Empty>불러오는 중…</Empty>
                  : <Empty>관측 안 됨 — 라이브 인벤토리 계약은 레이블을 노출하지 않습니다.</Empty>}
              </Sec>
              <Sec title="어노테이션" defaultOpen={false}>
                <Empty>관측 안 됨 — 라이브 인벤토리 계약은 어노테이션을 노출하지 않습니다.</Empty>
              </Sec>
              <Sec title="메타데이터">
                <KV k="UID" v={row.uid != null && String(row.uid) ? String(row.uid) : "관측 안 됨"} mono />
                <KV k="Resource Version" v="관측 안 됨" mono />
                <KV k="Generation" v="관측 안 됨" mono />
                <KV k="생성 시점" v={row.created != null && String(row.created) ? String(row.created) : "관측 안 됨"} mono />
              </Sec>

              {/* 점검 결과 (워크로드·파드) — 점검(audit) 계약이 배선되어 있지 않다 */}
              {wp && (
              <Sec title="점검 결과" icon={ShieldCheck}>
                <Empty>관측 안 됨 — 이 환경에는 리소스 점검(audit) 계약이 배선되어 있지 않습니다.</Empty>
              </Sec>
              )}
            </div>
          )}

          {tab === "yaml" && (
            <LiveResourceManifestEditor resourceId={resourceId} />
          )}


          {tab === "events" && (
            <div style={{ padding: "12px 0" }}>
              {/* M16: 워크로드 상세 계약의 관측 이벤트를 렌더한다. 미지원 kind는 honest 빈상태. */}
              {wd.status === "idle" ? <Empty>관측 안 됨 — 이 리소스의 이벤트 계약이 없습니다.</Empty>
                : wd.status === "loading" ? <Empty>불러오는 중…</Empty>
                : wd.status === "error" ? <RetryNote onRetry={wd.retry} label="이벤트를 불러오지 못했습니다." />
                : wd.events.length === 0 ? <Empty>최근 관측된 이벤트가 없습니다.{wd.eventsAvailability === "partial" ? " (부분 관측)" : ""}</Empty>
                : (<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {wd.eventsAvailability === "partial" && <div style={{ fontSize: TYPE.caption2, color: UI.ink3, marginBottom: 3 }}>일부 범위만 관측된 부분 이벤트입니다.</div>}
                    {wd.events.map((e, i) => (
                      <div key={`${e.reason ?? "ev"}-${i}`} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, border: `1px solid ${UI.line2}`, background: UI.bg2, borderRadius: 8, padding: "8px 12px" }}>
                        <span style={{ fontSize: TYPE.label, color: UI.ink }}>{statusLabel(e.reason)}{e.type ? ` · ${statusLabel(e.type)}` : ""}{e.count != null && e.count > 1 ? ` ×${e.count}` : ""}</span>
                        {e.lastAt && <span style={{ fontSize: TYPE.caption2, color: UI.ink3, flexShrink: 0 }}>{e.lastAt.replace("T", " ").slice(0, 16)}</span>}
                      </div>
                    ))}
                  </div>)}
            </div>
          )}

          {tab === "logs" && (
            <div style={{ padding: "18px 0", fontSize: TYPE.label, color: UI.ink3, lineHeight: 1.6 }}>
              관측 안 됨 — 이 환경에는 로그 스트림 계약이 배선되어 있지 않습니다.
            </div>
          )}

          {tab === "rbac" && (
            <div style={{ padding: "14px 0" }}><ResourceAccessPanel view={access} /></div>
          )}
        </div>
        </div>
      </motion.aside>
    </>
  );
}

// ── 종류 탐색 — 우측 패널 '리소스' 탭 내용 (보조 사이드바를 통합·대체) ─────────────────────────────

// ── 트래픽 보조 패널 — 서비스 호출 상태·포커스(D22: 세 관점 모두 같은 자리 보조 패널) ──
function TrafficPanel({ clusterIds, focus, onFocus, onOpen, stickyTop }: {
  clusterIds: readonly string[]; focus: string | null; onFocus: (id: string | null) => void;
  onOpen: (node: RelationNodeView) => void; stickyTop: number;
}) {
  // 실 관계 토폴로지(GET /api/topology?view=relations)의 서비스 노드 — svcCatalog fixture·합성 RPS 제거.
  // 계약이 RPS/p99를 노출하지 않으므로 호출량 수치는 표기하지 않는다(관측 안 됨).
  const topo = useRelationTopology(clusterIds);
  // M20: React key·포커스는 cluster 한정 합성 id(n.id)로 — 여러 클러스터의 동일 서비스명이
  // 충돌해 dup key가 나거나 한 행이 다른 클러스터 서비스를 가리키지 않게 한다. 표시·상세
  // 열기는 서비스 이름을 쓴다.
  const rows = useMemo(() => topo.status === "ready"
    ? topo.nodes.map((n) => ({ node: n, id: n.id, name: n.name || n.id, ns: n.namespace, bad: /error|fail|crit|degrad|down|unhealthy/i.test(n.status) }))
    : [], [topo]);
  const visibleRows = rows.slice(0, 40);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);
  return (
    <aside style={{ width: 248, flexShrink: 0, alignSelf: "flex-start", position: "sticky", top: stickyTop, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: 12, maxHeight: `calc(100vh / ${PRESENT_SCALE} - ${stickyTop + 48}px)`, overflowY: "auto", scrollbarGutter: "stable", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 2px 7px" }}>
        <span style={{ fontSize: TYPE.bodyStrong, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink }}>서비스 호출 상태</span>
        {focus && <button type="button" aria-label="서비스 포커스 해제" onClick={() => onFocus(null)} style={{ marginLeft: "auto", border: "none", background: inkA(0.05), color: UI.ink3, borderRadius: 999, padding: "2px 9px", fontSize: TYPE.caption, fontWeight: 700, cursor: "pointer" }}>해제</button>}
      </div>
      {topo.status === "loading" && <span style={{ fontSize: TYPE.caption, color: UI.ink3, padding: "6px 2px" }}>불러오는 중…</span>}
      {topo.status === "unavailable" && <span style={{ fontSize: TYPE.caption, color: UI.ink3, padding: "6px 2px" }}>관계 토폴로지 관측 안 됨</span>}
      {topo.status === "ready" && rows.length === 0 && <span style={{ fontSize: TYPE.caption, color: UI.ink3, padding: "6px 2px" }}>관측된 서비스가 없습니다</span>}
      {visibleRows.map((r) => (
        <button type="button" aria-label={`${r.name} 서비스 그래프 포커스`} key={r.id} onClick={() => onFocus(focus === r.id ? null : r.id)} onDoubleClick={() => onOpen(r.node)} className="rrow"
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: `1px solid ${focus === r.id ? TINT.blue.bd : "transparent"}`, background: focus === r.id ? TINT.blue.bg : "transparent", borderRadius: 9, padding: "7px 9px", cursor: "pointer" }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: r.bad ? HP.crit : HP.ok, flexShrink: 0 }} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: TYPE.label2, fontWeight: 700, fontFamily: MONO, color: UI.ink }}>{r.name}</span>
            <span style={{ display: "block", fontSize: TYPE.caption, color: UI.ink3 }}>{r.ns ?? "—"}</span>
          </span>
          {r.bad
            ? <span style={{ fontSize: TYPE.caption, fontWeight: 700, color: TINT.crit.fg, background: critA(0.09), border: `1px solid ${critA(0.3)}`, borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>장애</span>
            : <span style={{ width: 6, height: 6, borderRadius: 999, background: HP.ok, flexShrink: 0 }} />}
        </button>
      ))}
      {hiddenCount > 0 && (
        <span style={{ fontSize: TYPE.caption2, color: UI.ink3, padding: "8px 9px", borderTop: `1px solid ${UI.line2}` }}>
          현재 범위의 나머지 서비스 {hiddenCount}개는 검색·범위 축소 후 표시됩니다.
        </span>
      )}
      <span style={{ fontSize: TYPE.caption, color: UI.ink3, padding: "7px 2px 0", lineHeight: 1.5 }}>클릭 = 그래프 포커스 · 더블클릭 = 상세</span>
    </aside>
  );
}

function KindIndex({ sel, onPick, showEmpty, setShowEmpty, pinned, togglePin, filter, counts }: {
  sel: string; onPick: (k: Kind) => void; showEmpty: boolean; setShowEmpty: (v: boolean) => void;
  pinned: string[]; togglePin: (id: string) => void; filter: string; // 상단 ⌘K 검색이 단일 소스 — 자체 검색창 없음
  counts: Record<string, number>; // 라이브 인벤토리 요약 파생 카운트(없으면 0 = 관측 안 됨)
}) {
  const cnt = (k: Kind) => counts[k.id] ?? 0;
  const emptyCount = KINDS.filter((k) => cnt(k) === 0).length;
  const match = (k: Kind) => (k.label + k.id).toLowerCase().includes(filter.toLowerCase());
  const Row = ({ k }: { k: Kind }) => {
    const on = sel === k.id;
    return (
      <button onClick={() => onPick(k)} className="krow"
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: on ? blueA(0.09) : "transparent", borderRadius: 8, padding: "6px 9px" }}>
        <k.icon size={13} style={{ color: on ? BLUE : UI.ink3, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: TYPE.body, fontWeight: on ? 600 : 500, color: on ? BLUE : UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</span>
        <span role="button" title="즐겨찾기" onClick={(e) => { e.stopPropagation(); togglePin(k.id); }} className="kpin" style={{ display: "grid", placeItems: "center", opacity: pinned.includes(k.id) ? 1 : 0 }}>
          <Pin size={10} style={{ color: pinned.includes(k.id) ? BLUE : UI.ink3 }} />
        </span>
        <span style={{ fontSize: TYPE.caption, fontWeight: 600, fontFamily: MONO, color: cnt(k) ? (on ? BLUE : UI.ink2) : UI.ink3, background: on ? blueA(0.12) : inkA(0.05), borderRadius: 5, padding: "1px 6px", minWidth: 22, textAlign: "center", flexShrink: 0 }}>{cnt(k)}</span>
      </button>
    );
  };
  return (
    <nav style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      {pinned.length > 0 && (
      <div>
        <div style={{ fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.07em", color: UI.ink3, padding: "0 9px 5px" }}>즐겨찾기</div>
        {KINDS.filter((k) => pinned.includes(k.id)).map((k) => <Row key={k.id} k={k} />)}
      </div>
      )}
      {GROUPS.map((g) => {
        const list = KINDS.filter((k) => k.group === g && (showEmpty || cnt(k) > 0) && match(k));
        if (!list.length) return null;
        return (
          <div key={g}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 9px 5px" }}>
              <span style={{ fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.07em", color: UI.ink3 }}>{g}</span>
              <span style={{ marginLeft: "auto", fontSize: TYPE.micro, fontFamily: MONO, color: UI.ink3 }}>{GROUP_TOTAL(g, counts)}</span>
            </div>
            {list.map((k) => <Row key={k.id} k={k} />)}
          </div>
        );
      })}
      <button onClick={() => setShowEmpty(!showEmpty)} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: UI.ink3, fontSize: TYPE.label, cursor: "pointer", padding: "9px", borderTop: `1px solid ${UI.line2}` }}>
        <Eye size={12} />{showEmpty ? "비어 있는 종류 숨기기" : `비어 있는 종류 ${emptyCount}개 표시`}
      </button>
    </nav>
  );
}

// ── 전역 내비게이션 레일 — 병합 IA 8항목(D19). 트래픽은 리소스의 '흐름' 관점으로,
//    애플리케이션·GitOps·Helm은 '배포'로 흡수. 8항목 전부 실서피스다.
const NAV_ITEMS: { id: string; label: string; icon: typeof Home }[] = [
  { id: "home", label: "홈", icon: Home },
  { id: "resources", label: "리소스", icon: ListTree },
  { id: "deploy", label: "배포", icon: Rocket },
  { id: "issues", label: "이슈", icon: AlertTriangle },
  { id: "timeline", label: "타임라인", icon: Clock },
  { id: "checks", label: "점검", icon: ShieldCheck },
  { id: "cost", label: "비용", icon: Coins },
  // 알림·AI 대화 = 내역 모아보기 서피스(벨·AI 패널의 "전체 보기" 목적지) — 주 내비 소속
  { id: "alerts", label: "알림", icon: Bell },
  { id: "ai", label: "AI 대화", icon: Sparkles },
];
// 연결은 내비 항목이 아니다(D7·D20) — 클러스터 뷰 '+ 연결' 카드와 배포 탭 '+ 저장소 연결'에서 모달로만 연다.
// 설정은 전역 앱 설정만(D20).
const NAV_BOTTOM: { id: string; label: string; icon: typeof Home }[] = [
  { id: "settings", label: "설정", icon: Settings },
];

type Surface = "home" | "resources" | "connect" | "deploy" | "issues" | "timeline" | "checks" | "cost" | "alerts" | "ai" | "settings";
const SURFACE_OF: Record<string, Surface> = { home: "home", resources: "resources", deploy: "deploy", issues: "issues", timeline: "timeline", checks: "checks", cost: "cost", alerts: "alerts", ai: "ai", settings: "settings" };
// 리소스 서피스의 관점(D18) — 한 서피스, 세 관점. 스코프는 관점을 넘어 보존된다.
type ResView = "map" | "list" | "flow";

function GlobalNav({ collapsed, setCollapsed, surface, onSurface }: {
  collapsed: boolean; setCollapsed: (v: boolean) => void;
  surface: Surface; onSurface: (s: Surface) => void;
}) {
  const Item = ({ it }: { it: (typeof NAV_ITEMS)[number] }) => {
    const sid = SURFACE_OF[it.id];
    const active = !!sid && surface === sid;
    const enabled = active || !!sid;
    return (
      <button type="button" className={enabled ? "gnav" : undefined} title={collapsed ? it.label : undefined}
        aria-label={`${it.label} 화면으로 이동`} aria-current={active ? "page" : undefined}
        disabled={!sid} onClick={sid ? () => onSurface(sid) : undefined}
        style={{ display: "flex", alignItems: "center", gap: 11, borderRadius: 9, padding: collapsed ? "9px 0" : "8px 11px", justifyContent: collapsed ? "center" : "flex-start",
          width: "100%", border: "none", textAlign: "left",
          background: active ? blueA(0.09) : "transparent", color: active ? BLUE : enabled ? UI.ink2 : UI.ink3,
          opacity: enabled ? 1 : 0.45, cursor: enabled ? "pointer" : "default", transition: "background .14s" }}>
        <it.icon size={16} style={{ flexShrink: 0 }} />
        {!collapsed && <span style={{ fontSize: TYPE.body, fontWeight: active ? 700 : 500, whiteSpace: "nowrap" }}>{it.label}</span>}
      </button>
    );
  };
  return (
    <motion.nav initial={false} animate={{ width: collapsed ? 60 : 208 }} transition={SOFT}
      style={{ flexShrink: 0, background: UI.card, borderRight: `1px solid ${UI.line}`, display: "flex", flexDirection: "column",
        padding: "14px 10px 12px", position: "sticky", top: 0, height: `calc(100vh / ${PRESENT_SCALE})`, overflow: "hidden" }}>
      {/* 브랜드 — Opsia 워드마크 */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: collapsed ? "0 0 16px" : "0 4px 16px", justifyContent: collapsed ? "center" : "flex-start" }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg, ${BLUE}, ${BLUE2})`, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, border: `2px solid ${UI.card}` }} />
        </span>
        {!collapsed && <span style={{ fontSize: TYPE.title3, fontWeight: 800, letterSpacing: "-0.02em", color: UI.ink }}>Opsia</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>{NAV_ITEMS.map((it) => <Item key={it.id} it={it} />)}</div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 1, borderTop: `1px solid ${UI.line2}`, paddingTop: 8 }}>
        {NAV_BOTTOM.map((it) => <Item key={it.id} it={it} />)}
        <button type="button" aria-label={collapsed ? "주 메뉴 펼치기" : "주 메뉴 접기"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)} className="gnav"
          style={{ display: "flex", alignItems: "center", gap: 11, border: "none", background: "transparent", borderRadius: 9, padding: collapsed ? "9px 0" : "8px 11px", justifyContent: collapsed ? "center" : "flex-start", color: UI.ink3, cursor: "pointer" }}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span style={{ fontSize: TYPE.body, fontWeight: 600 }}>접기</span>}
        </button>
      </div>
    </motion.nav>
  );
}

// ── 홈 서피스 (D21: 고정 헤더 + 클러스터 섹션 + 위젯 보드 W2~W8) ─────────────
// 모든 숫자는 단일 인벤토리 파생. 위젯 배치는 localStorage 보존, 편집=숨김·추가·이동(제품은 dnd-kit 드래그).
const W_DEFS: { id: string; title: string; info: string; span: 1 | 2 | 4 }[] = [
  // 4칸 그리드 스팬 설계 — 1행 [1+1+2] · 2행 [1+2+1] · 3행 [4]: 기본 배치에서 빈칸 0
  { id: "W2", title: "이슈", info: "장애 상태 파드에서 파생된 활성 이슈 상위 3건", span: 1 },
  { id: "W3", title: "저장소 동기화", info: "Git 저장소 단위 동기화 상태 — 앱 단위 현황은 배포 화면", span: 1 },
  { id: "W4", title: "활동 추이", info: "기간 내 배포·알림·장애 리소스 수의 흐름", span: 2 },
  { id: "W5", title: "네임스페이스 파드 분포", info: "파드 수 상위 네임스페이스 — 항목 클릭 시 리소스 목록으로 필터 이동", span: 1 },
  { id: "W6", title: "장애·주의 리소스", info: "지금 주의가 필요한 리소스 상위 5 — 행 클릭 시 상세", span: 2 },
  { id: "W7", title: "비용", info: "이번 달 클러스터 비용 요약 (증가는 주의 톤)", span: 1 },
  { id: "W8", title: "최근 변경", info: "타임라인 최신 변경 5건의 미니 뷰", span: 4 },
];
const BOARD_KEY = "opsia-demo-board-v2"; // v2: W5~W8 기본 노출(D21 위젯 보드 전체가 기본값)
type BoardState = { order: string[]; hidden: string[]; collapsed: string[] };
const defaultBoard = (): BoardState => ({ order: W_DEFS.map((w) => w.id), hidden: [], collapsed: [] });
const readBoard = (): BoardState => {
  try { const s = JSON.parse(localStorage.getItem(BOARD_KEY) || ""); if (Array.isArray(s.order)) return { ...defaultBoard(), ...s }; } catch { /* 기본값 */ }
  return defaultBoard();
};

function HomeSurface({ clusterMeta, incidentClusterIds, onDrillCluster, onConnect, onOpenPod: _onOpenPod, onPickNs, onWidgetDeepLink, onOpenIssues, pendingCl = [], pendingRepo = [] }: {
  clusterMeta: Record<string, Record<string, number>>;
  incidentClusterIds: readonly string[];
  onDrillCluster: (clId: string) => void; onConnect: () => void;
  onOpenPod: (name: string) => void; onPickNs: (ns: string) => void;
  pendingCl?: string[]; pendingRepo?: string[]; onWidgetDeepLink?: (id: string) => void; onOpenIssues?: () => void;
}) {
  // 상단 요약 칩은 렌더 지점(아래 IIFE)에서 실 관측 파생(issues·apps)으로 계산 — fixture 인벤토리 제거.
  const clusters = Object.keys(clusterMeta);
  // W2 이슈 위젯 — 실 RCA 이슈 큐(GET /api/dashboard/rca/issues). 빈 배열=관측된 이슈 없음.
  const issues = useRcaIssues(incidentClusterIds);
  // W7 비용 위젯 — 실 GET /api/cost/overview. 현 계약은 관측 unavailable(가격 backfill 금지).
  const cost = useCostOverview();

  // priority 14: 좁은 화면(≤768px)에서 클러스터 카드·위젯 보드를 1열로, 상단 컨트롤을
  // 줄바꿈해 한글이 글자 단위로 세로 붕괴하지 않도록 한다.
  const narrow = useNarrowViewport();
  const [period, setPeriod] = useState<"오늘" | "7일" | "30일">("오늘");
  const [board, setBoard] = useState<BoardState>(readBoard);
  const [editing, setEditing] = useState(false);
  const save = (b: BoardState) => { setBoard(b); try { localStorage.setItem(BOARD_KEY, JSON.stringify(b)); } catch { /* 데모 */ } };
  // 드래그 리오더 — 끌고 있는 카드가 다른 카드 위를 지나면 즉시 자리를 바꾼다(라이브 미리보기, motion layout이 스프링으로 따라온다)
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOverWidget = (overId: string) => {
    if (!dragId || dragId === overId) return;
    const order = [...board.order];
    const from = order.indexOf(dragId), to = order.indexOf(overId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragId);
    save({ ...board, order });
  };

  // 활동 추이 — 기간 컨텍스트에 따라 포인트 수만 달라지는 결정적 시계열 (단일 시드)

  // W5 네임스페이스 분포 — 실 클러스터 인벤토리 요약의 네임스페이스별 파드 수.
  const nsView = useInventoryNamespaces(clusters);
  const nsDist = useMemo(() => {
    const arr = nsView.items;
    const top = arr.slice(0, 5).map((n) => ({ label: n.namespace, value: n.podCount }));
    const rest = arr.slice(5).reduce((s, n) => s + n.podCount, 0);
    return rest > 0 ? [...top, { label: "기타", value: rest, pick: false }] : top; // '기타'는 필터 목적지가 없다 — 클릭 불가
  }, [nsView.items]);
  // W6 장애·주의 리소스 — 실 RCA 이슈 큐의 미해결 이슈 상위 5(홈 W2와 동일 소스).
  const watch = useMemo(() => {
    if (issues.status !== "ready") return [];
    return issues.items
      .filter((iss) => !/resolved/i.test(iss.status))
      .slice(0, 5)
      .map((iss) => ({
        id: iss.correlationId,
        tone: (iss.severity === "warning" ? "warn" : "crit") as "warn" | "crit",
        title: iss.resourceName ?? iss.correlationId.slice(0, 12),
        sub: [iss.namespace, iss.clusterId].filter(Boolean).join(" · ") || operationalMessageLabel(iss.symptom || iss.status),
        right: statusLabel(iss.status),
      }));
  }, [issues]);
  // W8 최근 변경 · W4 활동 — 실 GET /api/changes(버킷 시계열 + 순서 이벤트).
  const changeTimeline = useChangeTimeline();
  // W3 저장소 동기화 — 실 GET /api/applications(배포/GitOps 상태).
  const apps = useApplications();
  // 렌더 순수성 — Date.now() 상대시각 금지. 이벤트의 절대 시각(월/일 HH:MM)만 표기.
  const clockTime = (ms: number) => {
    const d = new Date(ms);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}/${dd} ${hh}:${mi}`;
  };

  const body = (id: string) => {
    switch (id) {
      case "W2":
        if (issues.status === "loading") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</span>;
        if (issues.status === "unavailable") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>이슈를 불러오지 못했습니다</span>;
        return issues.items.length
          ? <RankList onPick={onOpenIssues ? () => onOpenIssues() : undefined} rows={issues.items.slice(0, 3).map((iss) => ({
              id: iss.correlationId,
              tone: iss.severity === "warning" ? "warn" as const : "crit" as const,
              title: `${iss.resourceName ?? iss.correlationId} · ${operationalMessageLabel(iss.symptom ?? iss.status)}`,
              sub: [iss.namespace, iss.clusterId].filter(Boolean).join(" · ") || statusLabel(iss.status),
              right: statusLabel(iss.status),
            }))} />
          : <span style={{ fontSize: TYPE.label2, color: UI.ink2 }}>활성 이슈가 없습니다</span>;
      case "W3":
        if (apps.status === "loading") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</span>;
        if (apps.status === "unavailable") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>애플리케이션을 불러오지 못했습니다</span>;
        if (apps.items.length === 0) return <span style={{ fontSize: TYPE.label2, color: UI.ink2 }}>관측된 애플리케이션이 없습니다</span>;
        {
          const outSyncApps = apps.items.filter((a) => a.deliveryStatus && /pending|outofsync|drift|degraded|error/i.test(a.deliveryStatus)).length;
          const syncedApps = apps.items.length - outSyncApps;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <RatioBar a={syncedApps} b={outSyncApps} aLabel="동기화" bLabel="대기/드리프트" />
              {pendingRepo.length > 0 && <span style={{ fontSize: TYPE.caption2, color: TINT.blue.fg }}>연결 중 {pendingRepo.length} · 초기 동기화 대기</span>}
            </div>
          );
        }
      case "W4":
        if (changeTimeline.status === "loading") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</span>;
        if (changeTimeline.status === "unavailable") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>활동 관측 안 됨</span>;
        if (changeTimeline.buckets.length === 0) return <span style={{ fontSize: TYPE.label2, color: UI.ink2 }}>관측된 활동이 없습니다</span>;
        return <MultiLine series={[
          { label: "전체", color: BLUE, values: changeTimeline.buckets.map((b) => b.total) },
          { label: "경고", color: HP.warn, values: changeTimeline.buckets.map((b) => b.warnings) },
        ]} />;
      case "W5":
        if (nsView.status === "loading") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</span>;
        if (nsView.status === "unavailable") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>네임스페이스 관측 안 됨</span>;
        return nsDist.length
          ? <div style={{ flex: 1, display: "flex", alignItems: "center" }}><Donut items={nsDist} onPick={(l) => l !== "기타" && onPickNs(l)} /></div>
          : <span style={{ fontSize: TYPE.label2, color: UI.ink2 }}>관측된 파드가 없습니다</span>;
      case "W6":
        if (issues.status === "loading") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</span>;
        if (issues.status === "unavailable") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오지 못했습니다</span>;
        return watch.length
          ? <RankList onPick={onOpenIssues ? () => onOpenIssues() : undefined} rows={watch} />
          : <span style={{ fontSize: TYPE.label2, color: UI.ink2 }}>주의가 필요한 리소스가 없습니다</span>;
      case "W7": {
        if (cost.status === "loading") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</span>;
        if (cost.status === "error") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>비용을 불러오지 못했습니다</span>;
        // 현 dev 계약: 비용 관측 unavailable. 가짜 총액을 backfill하지 않고 정직 상태 표시.
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink2 }}>비용 관측 안 됨</span>
            <span style={{ fontSize: TYPE.caption2, color: UI.ink3 }}>{reasonLabel(cost.reasonCodes[0] ?? "cost_observation_unavailable")}</span>
          </div>
        );
      }
      case "W8":
        if (changeTimeline.status === "loading") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</span>;
        if (changeTimeline.status === "unavailable") return <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>최근 변경 관측 안 됨</span>;
        {
          const recent = [...changeTimeline.events].reverse().slice(0, 6);
          if (recent.length === 0) return <span style={{ fontSize: TYPE.label2, color: UI.ink2 }}>최근 변경이 없습니다</span>;
          return <MiniTimeline columns={2} items={recent.map((e) => ({
            id: e.id,
            time: clockTime(e.occurredMs),
            tone: (e.kind === "incident" ? "crit" : e.kind === "deployment" ? "ok" : "warn") as "ok" | "warn" | "crit",
            title: operationalMessageLabel(e.title),
          }))} />;
        }
      default: return null;
    }
  };

  const visible = board.order.filter((id) => !board.hidden.includes(id));
  const hiddenDefs = W_DEFS.filter((w) => board.hidden.includes(w.id));
  return (
    <main style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16, padding: "14px 18px 40px" }}>
      {/* ── 고정 헤더: 상태 요약 줄(지도 요약 줄과 같은 칩 문법·같은 표기 — 두 화면이 다른 형식으로 말하지 않는다) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {(() => {
          const seg: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.label, fontWeight: 600, color: UI.ink2, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 999, padding: "5px 11px", whiteSpace: "nowrap" };
          const num: React.CSSProperties = { fontFamily: MONO, fontWeight: 700, color: UI.ink, fontVariantNumeric: "tabular-nums" };
          // 실 관측 파생: 장애=RCA 이슈 큐, 동기화 필요=애플리케이션 배송 상태. 노드/파드 세분은 계약 미노출이라 클러스터 카드에만.
          const critCount = issues.status === "ready" ? issues.items.length : 0;
          const firstCrit = issues.items[0]?.clusterId ?? undefined;
          const outSyncCount = apps.status === "ready"
            ? apps.items.filter((a) => a.deliveryStatus && /pending|outofsync|drift|degraded|error/i.test(a.deliveryStatus)).length
            : 0;
          return (
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={seg}><Server size={11} style={{ color: UI.ink3 }} />클러스터 <b style={num}>{clusters.length}</b>{pendingCl.length > 0 && <span style={{ color: TINT.blue.fg }}>· 연결 중 {pendingCl.length}</span>}</span>
              {outSyncCount > 0 && (
                <span style={{ ...seg, borderColor: TINT.warn.bd, background: TINT.warn.bg, color: TINT.warn.fg }}>
                  <GithubIcon size={11} />동기화 필요 <b style={{ ...num, color: TINT.warn.fg }}>{outSyncCount}</b>
                </span>
              )}
              {critCount > 0 && (
                <button onClick={() => (onOpenIssues ? onOpenIssues() : (firstCrit && onDrillCluster(firstCrit)))} title="이슈 목록에서 원인·복구 보기"
                  style={{ ...seg, borderColor: TINT.crit.bd, background: TINT.crit.bg, color: HP.crit, fontWeight: 700, cursor: "pointer" }}>
                  <Activity size={12} />장애 {critCount}
                </button>
              )}
            </span>
          );
        })()}
        {/* 좁은 화면: 우측 컨트롤을 왼쪽 정렬로 되돌리고 줄바꿈해 상단 잘림/가로 넘침을 막는다. */}
        <span style={{ marginLeft: narrow ? 0 : "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "flex", gap: 2, background: inkA(0.05), borderRadius: 8, padding: 2 }}>
            {(["오늘", "7일", "30일"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                style={{ border: "none", borderRadius: 6, padding: "3px 10px", fontSize: TYPE.caption2, fontWeight: 600, cursor: "pointer", background: period === p ? UI.card : "transparent", color: period === p ? UI.ink : UI.ink3, boxShadow: period === p ? `0 1px 3px ${inkA(0.12)}` : "none" }}>{p}</button>
            ))}
          </span>
          <button onClick={() => setEditing(!editing)}
            style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${editing ? blueA(0.45) : UI.line}`, background: editing ? blueA(0.07) : UI.card, color: editing ? BLUE : UI.ink2, borderRadius: 9, padding: "5px 12px", fontSize: TYPE.label, fontWeight: 700, cursor: "pointer" }}>
            <Pencil size={12} />{editing ? "편집 완료" : "레이아웃 편집"}
          </button>
          <button onClick={onConnect}
            style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: BLUE, color: UI.card, borderRadius: 9, padding: "6px 13px", fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>+ 클러스터 연결</button>
        </span>
      </div>

      {/* ── 클러스터 섹션 (보드 밖 고정 — 홈의 본질) ── */}
      <HomeClusterSection meta={clusterMeta} onOpen={onDrillCluster} pending={pendingCl} />

      {/* ── 위젯 보드 — 4칸 그리드 + 밀집 배치(dense): 숨김·이동으로 생긴 빈칸에 작은 위젯이 위로 올라와 채운다 ── */}
      {/* stretch 정렬 — 같은 행의 위젯은 세로 크기가 동일하다(가장 큰 위젯 기준) */}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0, 1fr)" : "repeat(4, minmax(0, 1fr))", gridAutoFlow: "row dense", gap: 14 }}>
        {visible.map((id) => {
          const def = W_DEFS.find((w) => w.id === id)!;
          return (
            <motion.div key={id} layout transition={SPRING}
              style={{ gridColumn: narrow ? "span 1" : `span ${Math.min(def.span, 4)}`, minWidth: 0, height: "100%", opacity: dragId === id ? 0.55 : 1 }}>
              {/* 네이티브 드래그는 플레인 래퍼가 담당 — motion의 팬 제스처 onDragStart와 충돌 방지 */}
              <div draggable={editing}
                onDragStart={editing ? (e: React.DragEvent) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; } : undefined}
                onDragOver={editing ? (e: React.DragEvent) => { e.preventDefault(); dragOverWidget(id); } : undefined}
                onDragEnd={editing ? () => setDragId(null) : undefined}
                style={{ height: "100%", cursor: editing ? "grab" : undefined }}>
              <WidgetFrame title={def.title} info={def.info}
                onDeepLink={onWidgetDeepLink ? () => onWidgetDeepLink(id) : undefined} deepLabel="전체 보기"
                collapsed={board.collapsed.includes(id)}
                onToggle={() => save({ ...board, collapsed: board.collapsed.includes(id) ? board.collapsed.filter((x) => x !== id) : [...board.collapsed, id] })}
                editing={editing}
                onRemove={() => save({ ...board, hidden: [...board.hidden, id] })}>
                {body(id)}
              </WidgetFrame>
              </div>
            </motion.div>
          );
        })}
        {editing && hiddenDefs.length > 0 && (
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", border: `1.5px dashed ${UI.line}`, borderRadius: 14, padding: "11px 14px" }}>
            <span style={{ fontSize: TYPE.label, fontWeight: 700, color: UI.ink3, whiteSpace: "nowrap" }}>위젯 추가</span>
            {hiddenDefs.map((w) => (
              <button key={w.id} onClick={() => save({ ...board, hidden: board.hidden.filter((x) => x !== w.id) })}
                style={{ border: `1px solid ${UI.line}`, background: UI.card, color: UI.ink, borderRadius: 999, padding: "4px 12px", fontSize: TYPE.label, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ {w.title}</button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// ── 앱 ─────────────────────────────
// 종류 선택 → 맵 '연결 보기' 탭 매핑 (같은 축은 한 몸으로 움직인다)
// P1: 워크스페이스 표시명 — 백엔드 workspace_id는 "default"지만 제품 표기는 "Krafton Jungle".
// 다른 워크스페이스 id는 그대로 노출한다(지어내지 않음).
function workspaceLabel(id: string | null | undefined): string {
  if (id == null || id === "") return "워크스페이스 확인 중";
  return id === "default" ? "Krafton Jungle" : id;
}

const lensTabFor = (id: string): "svc" | "cfg" | "git" | null =>
  id === "Service" ? "svc"
  : id === "ConfigMap" || id === "Secret" ? "cfg"
  : ["Application", "ApplicationSet", "AppProject"].includes(id) ? "git"
  : null;

function App() {
  const contract = useDevpreviewContracts();
  // 헤더 계정/워크스페이스/로그아웃 — 실 GET /api/auth/session(하드코딩 세션 제거).
  const session = useSession();
  const clusterIds = useMemo(() => contract.clusters.map((cluster) => cluster.id), [contract.clusters]);
  const incidentClusterIds = useMemo(
    () => activeIncidentClusterIds(contract.clusters),
    [contract.clusters],
  );
  const [kindId, setKindId] = useState("Deployment");
  const [resView, setResView] = useState<ResView>("map"); // D18 관점 — 지도가 기본, 스코프는 관점 공유
  const [trafficFocus, setTrafficFocus] = useState<string | null>(null); // 트래픽 보조 패널 → 그래프 포커스
  const [showEmpty, setShowEmpty] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const [q, setQ] = useState(""); // 단일 검색 — 종류 인덱스와 표 행을 동시에 필터
  const [surface, setSurface] = useState<Surface>("home"); // 셸 내 서피스 전환 — 홈이 랜딩(D19)
  const [scope, setScope] = useState<{ level: string; cluster?: string; node?: string }>({ level: "clusters" });
  const [ns, setNs] = useState("모든 네임스페이스");
  const [nsOpen, setNsOpen] = useState(false);
  // 네임스페이스 셀렉트 — 실 관측 네임스페이스(파드 관측 기반)로 구동. 하드코딩 목록 제거.
  // 계약이 unavailable/빈이면 "모든 네임스페이스"만 남는다.
  const resourcesListActive = surface === "resources" && resView === "list";
  const resourcesDrillActive = surface === "resources" && resView === "map" && scope.level !== "clusters";
  const nsFeed = useInventoryNamespaces(resourcesListActive ? clusterIds : []);
  const nsOptions = useMemo(() => ["모든 네임스페이스", ...nsFeed.items.map((item) => item.namespace)], [nsFeed.items]);
  const [meOpen, setMeOpen] = useState(false); // 계정 메뉴 (헤더 맨 오른쪽, D20)
  const [detail, setDetail] = useState<{ kind: Kind; row: Row } | null>(null);
  const [rcaIncident, setRcaIncident] = useState<RcaIncident | null>(null); // 이슈 RCA 사이드바 — 셸 레벨 렌더(transform 조상 밖)
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiW, setAiW] = useState(440);                 // 실제 제품처럼 리사이즈 가능한 도킹 폭
  const [aiDragging, setAiDragging] = useState(false);
  const [drillCl, setDrillCl] = useState<string | null>(null); // 홈 카드 → 지도 드릴 스코프 전달(D21)
  const [connectView, setConnectView] = useState<null | "repo" | "cluster">(null); // 연결 위저드 딥오픈 대상 (설정 서피스)
  const [connectModal, setConnectModal] = useState<null | "repo" | "cluster">(null); // 문맥 진입 = 모달 팝업
  // 세션 중 등록한 연결 대기 항목 — 등록의 결과가 목록에 보여야 한다(로그아웃=세션 초기화로 함께 소멸)
  const [pendingCl, setPendingCl] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem("opsia-demo-pending-cl") || "[]"); } catch { return []; } });
  const [pendingRepo, setPendingRepo] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem("opsia-demo-pending-repo") || "[]"); } catch { return []; } });
  const addPending = (scope: "cluster" | "repo", ref: string) => {
    const key = scope === "cluster" ? "opsia-demo-pending-cl" : "opsia-demo-pending-repo";
    const set = scope === "cluster" ? setPendingCl : setPendingRepo;
    set((xs) => { const nx = xs.includes(ref) ? xs : [...xs, ref]; try { sessionStorage.setItem(key, JSON.stringify(nx)); } catch { /* 데모 */ } return nx; });
  };
  const onAiHandleDown = (e: React.PointerEvent) => {
    e.preventDefault(); setAiDragging(true);
    const move = (ev: PointerEvent) => setAiW(Math.min(560, Math.max(380, (document.documentElement.clientWidth - ev.clientX) / PRESENT_SCALE)));
    const up = () => { setAiDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const scopeLabel = scope.level === "clusters" ? "전체 클러스터" : scope.level === "nodes" ? `클러스터 ${scope.cluster}` : `노드 ${scope.node}`;
  const kind = KINDS.find((k) => k.id === kindId)!;
  const togglePin = (id: string) => setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const searchRef = useRef<HTMLInputElement>(null);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  // 상단 크롬 높이 — 폰트·확대에 따라 변하므로 실측해서 오버레이 기준으로 쓴다
  const headerRef = useRef<HTMLElement>(null);
  const [topH, setTopH] = useState(TOPBAR_H);
  useEffect(() => {
    const el = headerRef.current; if (!el) return;
    // offsetHeight = CSS 픽셀 — zoom 컨테이너 안의 fixed top과 같은 좌표계 (시각 픽셀로 재면 zoom만큼 밀린다)
    const ro = new ResizeObserver(() => setTopH(el.offsetHeight));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  // 서피스·관점·물리 드릴·종류 전환 = 새 화면. 문서와 앱 내부 스크롤을 함께
  // 초기화해 긴 이슈/타임라인/노드 목록의 위치를 다음 화면으로 승계하지 않는다.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
    pageScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [surface, resView, scope.level, scope.cluster, scope.node, kindId]);
  // zoom 좌표계: fixed 오버레이 계산은 전부 CSS 픽셀(뷰포트/스케일)로
  const [vwCss, setVwCss] = useState(() => document.documentElement.clientWidth / PRESENT_SCALE);
  useEffect(() => {
    // 스크롤바 등장/소멸로 clientWidth가 바뀌는 경우까지 관찰 (window resize 이벤트로는 못 잡는다)
    const on = () => setVwCss(document.documentElement.clientWidth / PRESENT_SCALE);
    const ro = new ResizeObserver(on); ro.observe(document.documentElement);
    window.addEventListener("resize", on);
    return () => { ro.disconnect(); window.removeEventListener("resize", on); };
  }, []);
  // 반응형 리소스 목록 — 좁은 화면(실뷰포트 ≤768px)에서는 종류 사이드바(248px)가
  // 표를 덮어 행 클릭이 불가하던 결함을 없앤다. 이 폭에서는 사이드바를 상단 종류
  // 선택 컨트롤로 접고 표를 전체 폭으로 스택해 행·상세 드로어 도달성을 보장한다.
  // vwCss는 PRESENT_SCALE(zoom)로 나눈 콘텐츠 좌표라 실뷰포트 기준으로 환산한다.
  const narrowList = vwCss <= 768 / PRESENT_SCALE;
  // 반응형 — 좁은 화면(200% 확대 등)에서 내비를 자동으로 아이콘만 남긴다
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const on = () => { if (mq.matches) setNavCollapsed(true); };
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // 표 데이터: gateway가 단일 클러스터 경로만 제공하므로 전체 범위는 실제 클러스터별
  // 요청을 병렬 수행한 합집합이다. 카운트와 표가 같은 clusterIds를 사용해 2029/0 같은
  // 불일치가 생기지 않는다.
  const resourceClusterIds = resourcesListActive
    ? (scope.cluster ? [scope.cluster] : clusterIds)
    : [];
  const resourcesView = useInventoryResourcesAcrossClusters(resourceClusterIds, kindToResourceType(kindId));
  const allRows = resourcesView.rows;
  const inScope = scope.level !== "clusters" && !!scope.cluster;
  // 물리 토폴로지는 리소스 맵 드릴에서만 구독한다. 사용자가 목록·홈·이슈 등으로
  // 이동한 뒤에도 이전 scope가 남아 무거운 60초 reconciliation을 계속하지 않는다.
  const activeTopologyCluster = surface === "resources"
    && resView === "map"
    && scope.level !== "clusters"
    ? scope.cluster ?? null
    : null;
  const scopedTopology = useClusterTopology(activeTopologyCluster);
  const scopedNode = scope.level === "pods"
    ? scopedTopology.nodes.find((node) => node.name === scope.node)
    : undefined;
  const scopedNodePodKeys = useMemo(() => new Set(
    scopedNode ? podsForNode(scopedTopology.pods, scopedNode.key).map((pod) => pod.key) : [],
  ), [scopedNode, scopedTopology.pods]);
  // 행에 관측된 클러스터 귀속(cluster 필드)이 있으면 스코프와 일치할 때만 남긴다.
  // cluster 필드가 없으면 이름 해싱으로 귀속을 지어내지 않고 그대로 둔다(필터하지 않음).
  const scopedRows = useMemo(() => (inScope ? allRows.filter((row) => {
    const cl = typeof row.cluster === "string" ? row.cluster : "";
    if (cl !== "" && cl !== scope.cluster) return false;
    if (scope.level !== "pods" || kindId !== "Pod") return true;
    return scopedNodePodKeys.has(String(row._key ?? ""));
  }) : allRows), [allRows, inScope, kindId, scope.cluster, scope.level, scopedNodePodKeys]);
  const nsRows = useMemo(() => (ns === "모든 네임스페이스" ? scopedRows : scopedRows.filter((r) => r.ns === undefined || String(r.ns) === ns)), [scopedRows, ns]);
  const shownRows = useMemo(() => (q ? nsRows.filter((r) => String(r.name ?? "").toLowerCase().includes(q.toLowerCase())) : nsRows), [nsRows, q]);
  // 클러스터 카드 메타 — 라이브 인벤토리 요약(GET .../inventory/summary)의 종류별 카운트.
  // useInventoryKindCounts는 resource_type 키(소문자) 맵을 주므로, 소비처가 기대하는
  // kind 표기(Deployment 등)로 kindToResourceType 매핑을 통해 조회한다.
  const kindCountsView = useInventoryKindCounts(
    resourcesListActive || resourcesDrillActive ? clusterIds : [],
  );
  const clusterMeta = useMemo(() => {
    const kinds = ["Deployment", "StatefulSet", "DaemonSet", "Service", "Ingress", "Job", "CronJob", "Namespace"] as const;
    const meta: Record<string, Record<string, number>> = {};
    for (const cl of clusterIds) {
      meta[cl] = {};
      for (const k of kinds) meta[cl][k] = kindCountsView.meta[cl]?.[kindToResourceType(k)] ?? 0;
    }
    return meta;
  }, [clusterIds, kindCountsView.meta]);
  // 사이드바(KindIndex) 카운트 — 전 클러스터 합산 (kindId → resource_type로 조회).
  const kindCounts = useMemo(() => {
    const out: Record<string, number> = {};
    const countedClusters = scope.cluster ? [scope.cluster] : clusterIds;
    for (const k of KINDS) {
      const rt = kindToResourceType(k.id);
      let sum = 0;
      for (const cl of countedClusters) sum += kindCountsView.meta[cl]?.[rt] ?? 0;
      out[k.id] = sum;
    }
    if (scope.level === "pods" && scopedNode) {
      out.Pod = podsForNode(scopedTopology.pods, scopedNode.key).length;
    }
    return out;
  }, [clusterIds, kindCountsView.meta, scope.cluster, scope.level, scopedNode, scopedTopology.pods]);
  const openFromMap = (kid: string, data: Record<string, unknown>) => {
    const k = KINDS.find((x) => x.id === kid); if (k) setDetail({ kind: k, row: data });
  };

  // 알림 — 인벤토리 파생: 임계 파드(위험) + 예약 중 노드(정보) + OutOfSync 저장소(경고)
  const [bellOpen, setBellOpen] = useState(false);
  // 실 알림 이벤트(GET /api/... alert-events) — fixture 인벤토리 파생 알림 제거. 관측 안 되면 세션 알림(notes)만.
  const alertEvents = useAlertEvents();
  // 세션 알림 — 위저드 연결·AI 규칙 생성 등 실제 사용자 행동의 결과
  const [notes, setNotes] = useState<{ id: number; icon: "rule" | "connect"; title: string; body: string }[]>([]);
  const noteSeq = useRef(0);
  const liveAlerts = alertEvents.status === "ready" ? alertEvents.items : [];
  const alertTotal = liveAlerts.length + notes.length;
  const [toasts, setToasts] = useState<{ id: number; title: string; sub: string; tone: "ok" | "crit" }[]>([]);
  const toastSeq = useRef(0);
  const pushToast = (t: { title: string; sub: string; tone: "ok" | "crit" }) => {
    const id = ++toastSeq.current;
    setToasts((cur) => [...cur, { id, ...t }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 3800);
  };
  // 관련 리소스 이동 — 현재 로드된 라이브 rows에서 이름으로 찾고,
  // 없으면 최소 객체({name, ns})로 상세를 연다(기존 fallback 유지).
  const openRef = (kid: string, name: string) => {
    const k = KINDS.find((x) => x.id === kid); if (!k) return;
    const found = kid === kindId
      ? allRows.find((r) => String(r.name) === name || String(r.name).startsWith(name))
      : undefined;
    setDetail({ kind: k, row: found ?? { name } });
  };
  const openTrafficService = (node: RelationNodeView) => {
    const serviceKind = KINDS.find((item) => item.id === "Service");
    if (!serviceKind) return;
    setDetail({
      kind: serviceKind,
      row: { _key: node.id, cluster: node.clusterId, name: node.name, ns: node.namespace ?? undefined },
    });
  };
  // 버스 구독은 마운트 1회만 — 최신 openRef를 ref로 참조해 재구독 없이 호출한다.
  const openRefRef = useRef(openRef);
  useEffect(() => { openRefRef.current = openRef; });
  // 버스 수신 → 토스트 + 세션 알림 (선언은 위쪽, 여기서는 구독만)
  useEffect(() => onAction((a: DemoAction) => {
    // 내비게이션 액션 — AI 근거/링크가 셸의 실제 표면을 연다
    if (a.kind === "open_ref") { openRefRef.current(a.title, a.body); return; }
    if (a.kind === "open_crit") { setSurface("resources"); setResView("list"); setKindId("Pod"); return; }
    setNotes((n) => [{ id: ++noteSeq.current, icon: a.kind === "alert_rule" ? "rule" : "connect", title: a.title, body: a.body }, ...n]);
    pushToast({ title: a.title, sub: a.body, tone: "ok" });
    if (a.kind === "connect") {
      if (a.scope && a.ref) addPending(a.scope, a.ref);
      window.setTimeout(() => setConnectModal(null), 400); // 연결 완료 → 모달 닫힘
    }
  }), []);
  // 실 알림 이벤트의 절대 발생시각(월/일 HH:MM). Date.now() 상대시각은 렌더 순수성 위반이라 금지.
  const alertTime = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // 최상위 표면부터 z-서열 역순으로 '한 겹씩' 닫는다: 팝오버 → 연결 모달 → 상세 → AI
        if (bellOpen || nsOpen || meOpen) { setBellOpen(false); setNsOpen(false); setMeOpen(false); }
        else if (connectModal) setConnectModal(null);
        else if (detail) setDetail(null);
        else if (aiOpen) setAiOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [bellOpen, nsOpen, meOpen, connectModal, detail, aiOpen]);

  return (
    <div className="uni" style={{ minHeight: "100vh", background: UI.bg, display: "flex", alignItems: "stretch", zoom: PRESENT_SCALE }}>
      {/* 전역 내비게이션 — 제품 셸의 바깥 틀 */}
      <GlobalNav collapsed={navCollapsed} setCollapsed={setNavCollapsed}
        surface={surface} onSurface={(sf) => { setSurface(sf); if (sf === "connect") setConnectView(null); }} />

      <div ref={pageScrollRef} aria-label="현재 화면 콘텐츠" role="region"
        style={{ flex: 1, minWidth: 0, height: `calc(100vh / ${PRESENT_SCALE})`, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", scrollbarGutter: "stable" }}>
      {/* 상단 크롬 — 워크스페이스·스코프·네임스페이스·검색 (내부 표기 배지 제거) */}
      <header ref={headerRef} style={{ position: "sticky", top: 0, zIndex: 74, display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${UI.line}`, background: UI.card }}>
        {/* 워크스페이스 — 정체성은 항상 맨 왼쪽(D20). 데모 세계는 워크스페이스 1개라 사실 표시만 */}
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: TYPE.body, fontWeight: 700, color: UI.ink, paddingRight: 12, borderRight: `1px solid ${UI.line2}` }}>
          <Building2 size={14} style={{ color: UI.ink3 }} />{workspaceLabel(contract.workspaceId)}
        </span>
        {/* 새로고침 — 내부/기술 표기("실제 계약") 텍스트 제거, 상태점 + 아이콘만(P1-10) */}
        <button type="button" aria-label="라이브 데이터 새로고침" onClick={contract.refresh}
          title={contract.error ?? "새로고침"}
          style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", padding: 4, color: contract.status === "error" ? HP.crit : UI.ink3, cursor: "pointer" }}>
          <span className={contract.status === "loading" ? "livedot" : undefined}
            style={{ width: 6, height: 6, borderRadius: 999, background: contract.status === "error" ? HP.crit : contract.status === "ready" ? HP.ok : HP.pending }} />
          <RefreshCw size={13} style={{ color: contract.status === "error" ? HP.crit : UI.ink3 }} />
        </button>
        {/* 현재 스코프 표시 — 물리 스코프가 실제 적용되는 관점(지도·목록)에서만. 흐름은 서비스 수준 */}
        {surface === "resources" && resView !== "flow" && (
        <label style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${UI.line}`, borderRadius: 9, padding: "5px 9px", fontSize: TYPE.body, fontWeight: 600, color: UI.ink, background: UI.card }}>
          <Server size={13} style={{ color: UI.ink3, flexShrink: 0 }} />
          <select aria-label="클러스터 범위" value={scope.cluster ?? ""}
            onChange={(event) => {
              const cluster = event.currentTarget.value;
              setDetail(null);
              setDrillCl(cluster || null);
              setScope(cluster ? { level: "nodes", cluster } : { level: "clusters" });
            }}
            style={{ border: "none", outline: "none", background: "transparent", color: UI.ink, fontSize: TYPE.body, fontWeight: 700, cursor: "pointer", maxWidth: 220 }}>
            <option value="">전체 클러스터</option>
            {contract.clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.id}</option>)}
          </select>
        </label>
        )}
        {surface === "resources" && resView !== "flow" && (
        <span style={{ position: "relative" }}>
          <button type="button" aria-label="네임스페이스 범위 선택" aria-haspopup="listbox" aria-expanded={nsOpen} onClick={() => setNsOpen(!nsOpen)}
            style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${nsOpen ? blueA(0.45) : UI.line}`, background: UI.card, borderRadius: 9, padding: "6px 11px", fontSize: TYPE.body, fontWeight: 600, color: ns === "모든 네임스페이스" ? UI.ink : BLUE, cursor: "pointer" }}>
            <Globe size={13} style={{ color: UI.ink3 }} />{ns}<ChevronDown size={12} style={{ color: UI.ink3, transform: nsOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>
          <AnimatePresence>
            {nsOpen && (
              <motion.div key="ns" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={SOFT}
                style={{ position: "absolute", top: 40, left: 0, minWidth: 190, zIndex: 65, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 12, boxShadow: `0 18px 50px -18px ${inkA(0.28)}`, padding: 5, overflow: "hidden" }}>
                {nsOptions.map((o) => (
                  <button key={o} className="rrow" onClick={() => { setNs(o); setNsOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", background: ns === o ? blueA(0.08) : "transparent", borderRadius: 8, padding: "7px 10px", fontSize: TYPE.label2, fontWeight: ns === o ? 700 : 500, color: ns === o ? BLUE : UI.ink, cursor: "pointer" }}>
                    {o}{ns === o && <Check size={12} style={{ marginLeft: "auto" }} />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </span>
        )}
        <div style={{ flex: 1, maxWidth: 520, margin: "0 auto", display: "flex", alignItems: "center", gap: 8, border: `1px solid ${UI.line}`, background: UI.bg2, borderRadius: 9, padding: "6px 12px" }}>
          <Search size={13} style={{ color: UI.ink3 }} />
          {/* 전역 검색(D6) — 홈에서 입력하면 결과가 있는 리소스 목록으로 이동한다(무반응 인풋 금지) */}
          <input ref={searchRef} aria-label="리소스와 화면 전체 검색" value={q}
            onChange={(e) => { const v = e.currentTarget.value; setQ(v); if (v && surface !== "resources") { setSurface("resources"); setResView("list"); } }}
            placeholder="전체 검색 — 리소스·화면 이동" style={{ border: "none", outline: "none", background: "transparent", fontSize: TYPE.body, color: UI.ink, width: "100%" }} />
          <span style={{ fontSize: TYPE.caption, fontFamily: MONO, color: UI.ink3, border: `1px solid ${UI.line}`, borderRadius: 4, padding: "1px 5px" }}>⌘K</span>
        </div>
        {/* 알림 벨 — 배지 수는 맵의 장애 수와 같은 인벤토리에서 나온다 */}
        <span style={{ position: "relative" }}>
          <button type="button" className="gnav" aria-label="알림 센터 열기" aria-expanded={bellOpen} onClick={() => setBellOpen(!bellOpen)}
            style={{ width: 30, height: 30, borderRadius: 999, border: "none", background: bellOpen ? blueA(0.1) : inkA(0.045), color: bellOpen ? BLUE : UI.ink2, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <Bell size={14} />
          </button>
          {alertTotal > 0 && (
            <span style={{ position: "absolute", top: -3, right: -3, minWidth: 15, height: 15, borderRadius: 999, background: liveAlerts.some((e) => e.severity === "critical") ? HP.crit : HP.warn, color: UI.card, fontSize: TYPE.micro, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 4px", border: `2px solid ${UI.card}`, boxSizing: "content-box" }}>{alertTotal}</span>
          )}
          <AnimatePresence>
            {/* 애플 알림 센터 스타일 — 반투명 블러 패널 위 카드 스택 */}
            {bellOpen && (
              <motion.div key="bell" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.98 }} transition={SOFT}
                style={{ position: "absolute", top: 38, right: 0, width: 344, zIndex: 65, background: GLASS, backdropFilter: "blur(26px)", WebkitBackdropFilter: "blur(26px)",
                  border: `1px solid ${inkA(0.08)}`, borderRadius: 18, boxShadow: `0 28px 70px -24px ${inkA(0.38)}`, padding: 10, maxHeight: `min(calc(70vh / ${PRESENT_SCALE}), 560px)`, overflowY: "auto", scrollbarGutter: "stable" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "2px 8px 8px" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: UI.ink }}>알림</span>
                  <span style={{ fontSize: TYPE.caption2, fontWeight: 600, color: UI.ink3 }}>{alertTotal}</span>
                </div>
                {(pendingCl.length + pendingRepo.length > 0) && (
                  <div style={{ padding: "0 8px 8px" }}>
                    <div style={{ fontSize: TYPE.caption, fontWeight: 700, letterSpacing: "0.05em", color: UI.ink3, padding: "0 2px 6px" }}>진행 중</div>
                    {[...pendingCl.map((n) => ({ id: `pc-${n}`, t: n, b: "에이전트 부트스트랩 · 첫 인벤토리 수집 대기" })), ...pendingRepo.map((n) => ({ id: `pr-${n}`, t: n, b: "초기 동기화 대기" }))].map((x) => (
                      <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, background: cardA(0.85), border: `1px solid ${inkA(0.05)}`, borderRadius: 14, padding: "10px 12px", marginBottom: 6 }}>
                        <span className="pulsedot" style={{ width: 8, height: 8, borderRadius: 999, background: BLUE, flexShrink: 0 }} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: "block", fontSize: TYPE.label2, fontWeight: 700, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.t}</span>
                          <span style={{ display: "block", fontSize: TYPE.caption, color: UI.ink2, marginTop: 1 }}>{x.b}</span>
                        </span>
                        <span style={{ width: 34, height: 4, borderRadius: 999, background: blueA(0.15), overflow: "hidden", flexShrink: 0 }}>
                          <motion.span initial={{ x: -20 }} animate={{ x: 34 }} transition={{ repeat: Infinity, duration: DUR.meter, ease: "easeInOut" }} style={{ display: "block", width: 20, height: "100%", borderRadius: 999, background: BLUE }} />
                        </span>
                      </div>
                    ))}
                    <div style={{ fontSize: TYPE.caption, fontWeight: 700, letterSpacing: "0.05em", color: UI.ink3, padding: "6px 2px 0" }}>최근</div>
                  </div>
                )}
                {(() => {
                  const Card = ({ icon: I, tint, title, body, time, right, onClick }: { icon: typeof Bell; tint: string; title: string; body: string; time: string; right?: string; onClick?: () => void }) => (
                    <button type="button" className="acard" aria-label={`${title} 알림 상세 열기`} onClick={onClick} disabled={!onClick}
                      style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left", background: cardA(0.85),
                        border: `1px solid ${inkA(0.05)}`, borderRadius: 14, padding: "10px 12px", marginBottom: 6, cursor: onClick ? "pointer" : "default",
                        boxShadow: `0 1px 2px ${inkA(0.05)}` }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: tint, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                        <I size={14} color={UI.card} strokeWidth={2.2} />
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: TYPE.body, fontWeight: 700, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                          <span style={{ fontSize: TYPE.micro, color: UI.ink3, flexShrink: 0 }}>{time}</span>
                        </span>
                        <span style={{ display: "block", fontSize: TYPE.caption2, color: UI.ink2, marginTop: 2, lineHeight: 1.45 }}>{body}</span>
                        {right && <span style={{ display: "block", fontSize: TYPE.micro, fontFamily: MONO, color: UI.ink3, marginTop: 3 }}>{right}</span>}
                      </span>
                    </button>
                  );
                  return (
                    <>
                      {notes.map((nn) => (
                        <Card key={`note-${nn.id}`} icon={nn.icon === "rule" ? Bell : Plug} tint={nn.icon === "rule" ? BLUE : HP.ok} title={nn.title} time="방금" body={nn.body} />
                      ))}
                      {liveAlerts.map((ev) => (
                        <Card key={ev.eventId} icon={ev.severity === "critical" ? Activity : Server}
                          tint={ev.severity === "critical" ? HP.crit : HP.warn} title={ev.name} time={alertTime(ev.firedAt)}
                          body={[statusLabel(ev.severity), statusLabel(ev.status), ev.kind, ev.namespace, ev.ruleName].filter(Boolean).join(" · ")}
                          right={ev.cluster} onClick={() => { setBellOpen(false); openRef(ev.kind, ev.name); }} />
                      ))}
                      {alertEvents.status === "unavailable" && notes.length === 0 && (
                        <div style={{ padding: "10px 12px", fontSize: TYPE.caption2, color: UI.ink3 }}>알림 이벤트 관측 안 됨</div>
                      )}
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </span>
        {/* 계정 — 맨 오른쪽(D20). 로그아웃 = 데모 세션 초기화(실동작) */}
        <span style={{ position: "relative" }}>
          <button type="button" className="gnav" aria-label="계정 메뉴 열기" aria-expanded={meOpen} onClick={() => setMeOpen(!meOpen)}
            style={{ width: 30, height: 30, borderRadius: 999, border: meOpen ? `1.5px solid ${BLUE}` : "1.5px solid transparent", background: blueA(0.12), color: BLUE, cursor: "pointer", display: "grid", placeItems: "center", fontSize: TYPE.label, fontWeight: 800 }}>{sessionInitial(session)}</button>
          <AnimatePresence>
            {meOpen && (
              <motion.div key="me" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={SOFT}
                style={{ position: "absolute", top: 38, right: 0, width: 244, zIndex: 65, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 12, boxShadow: `0 18px 50px -18px ${inkA(0.28)}`, padding: 6, overflow: "hidden" }}>
                <div style={{ padding: "8px 10px 9px", borderBottom: `1px solid ${UI.line2}` }}>
                  <div style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.status === "loading" ? "확인 중…" : session.displayName ?? session.userId ?? "알 수 없음"}</div>
                  <div style={{ fontSize: TYPE.caption2, fontFamily: MONO, color: UI.ink3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.email ?? (session.roles.length ? session.roles.map(statusLabel).join(" · ") : session.authMode ? `인증 모드: ${statusLabel(session.authMode)}` : "이메일 없음")}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.caption2, color: UI.ink2, marginTop: 6 }}><Building2 size={11} style={{ color: UI.ink3 }} />{workspaceLabel(session.workspaceId ?? contract.workspaceId)} 워크스페이스</div>
                </div>
                {session.logoutSupported ? (
                  <button className="rrow" onClick={() => { void logoutApi().then(() => window.location.reload()).catch(() => undefined); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 8, padding: "8px 10px", marginTop: 3, fontSize: TYPE.label2, fontWeight: 600, color: UI.ink2, cursor: "pointer" }}>
                    <LogOut size={13} style={{ color: UI.ink3 }} />로그아웃
                  </button>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", marginTop: 3, fontSize: TYPE.caption2, color: UI.ink3 }}>
                    <LogOut size={13} style={{ color: UI.ink3 }} />{session.authMode === "trusted_proxy" ? "상위 프록시 인증 — 로그아웃은 상위에서" : "이 세션은 로그아웃을 지원하지 않습니다"}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </span>
      </header>

      {surface === "connect" ? (
        /* 연결 설정 — 셸 안에서 위저드 서피스로 전환 (별도 페이지 아님) */
        <div style={{ position: "relative", minHeight: `calc(100vh / ${PRESENT_SCALE} - 57px)`, background: UI.bg }}>
          <ConnectWizard key={connectView ?? "launcher"} embedded initialView={connectView} />
        </div>
      ) : surface === "deploy" ? (
        <DeploySurface pendingRepos={pendingRepo} onOpenRef={openRef} onAddRepo={() => setConnectModal("repo")} />
      ) : surface === "issues" ? (
        <IssuesSurface incidentClusterIds={incidentClusterIds} sessionRules={notes.filter((n) => n.icon === "rule").map((n) => n.body.split(" · ")[0])} onOpenRef={openRef} onAskAi={() => setAiOpen(true)} onOpenRca={setRcaIncident} />
      ) : surface === "timeline" ? (
        <TimelineSurface onOpenRef={openRef} />
      ) : surface === "checks" ? (
        <ChecksSurface onOpenRef={openRef} />
      ) : surface === "cost" ? (
        <CostSurface onOpenRef={openRef} />
      ) : surface === "alerts" ? (
        <AlertsSurface onOpenRef={openRef} />
      ) : surface === "ai" ? (
        <AiHistorySurface onOpenPanel={() => setAiOpen(true)} />
      ) : surface === "settings" ? (
        <SettingsSurface />
      ) : surface === "home" ? (
        /* 홈 — 위젯 보드 (D21). 카드 클릭=지도 드릴, 위젯 액션=전부 실 목적지 */
        <HomeSurface clusterMeta={clusterMeta} incidentClusterIds={incidentClusterIds} pendingCl={pendingCl} pendingRepo={pendingRepo}
          onWidgetDeepLink={(id) => {
            if (id === "W2") setSurface("issues");
            else if (id === "W3") setSurface("deploy");
            else if (id === "W4" || id === "W8") setSurface("timeline");
            else if (id === "W7") setSurface("cost");
            else { setSurface("resources"); setResView("list"); setKindId("Pod"); }
          }}
          onDrillCluster={(cl) => { setDrillCl(cl); setSurface("resources"); setResView("map"); }}
          onOpenIssues={() => setSurface("issues")}
          onConnect={() => setConnectModal("cluster")}
          onOpenPod={(name) => openRef("Pod", name)}
          onPickNs={(n) => { if (nsOptions.includes(n)) setNs(n); setKindId("Pod"); setSurface("resources"); setResView("list"); }} />
      ) : (
        <main style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14, padding: "12px 18px 40px" }}>
          {/* ── D18 관점 세그먼트 — 한 서피스, 세 관점(지도·목록·흐름). "지도 밑 표" 구조 폐지.
                스코프(클러스터·노드·ns·검색어)는 관점을 넘어 보존된다 ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", gap: 2, background: inkA(0.05), borderRadius: 9, padding: 2 }}>
              {([["map", "인프라"], ["list", "쿠버네티스"], ["flow", "트래픽"]] as const).map(([v, l]) => (
                <button type="button" aria-pressed={resView === v} key={v} onClick={() => setResView(v)}
                  style={{ position: "relative", border: "none", background: "transparent", borderRadius: 7, padding: "5px 16px", fontSize: TYPE.label2, fontWeight: 700, color: resView === v ? UI.ink : UI.ink3, cursor: "pointer" }}>
                  {resView === v && <motion.span layoutId="resview" transition={SOFT} style={{ position: "absolute", inset: 0, background: UI.card, borderRadius: 7, boxShadow: `0 1px 4px ${inkA(0.14)}` }} />}
                  <span style={{ position: "relative" }}>{l}</span>
                </button>
              ))}
            </span>
            {/* P1: UI를 설명하는 데모성 카피("서비스 호출 관점 — 전체 클러스터")는 제거한다. */}
          </div>

          {resView === "map" && (
            /* 지도 — 드릴 전체 높이. 종류 선택은 목록 관점의 것: 패널·스트립에서 종류를 고르면 목록으로 전환 */
            <>
              <OpsiaMap key={drillCl ?? "root"} initialCluster={drillCl ?? undefined} pendingClusters={pendingCl} pendingRepos={pendingRepo}
                embedded onScopeChange={setScope} onOpenResource={openFromMap} onOpenRca={setRcaIncident} lensTab={lensTabFor(kindId)}
                onAddCluster={() => setConnectModal("cluster")}
                onAddRepo={() => setConnectModal("repo")}
                stickyTop={topH + 12}
                clusterMeta={clusterMeta}
                onOpenKind={(kid) => { setKindId(kid); setResView("list"); }} />
              {/* 종류(kind) 탐색은 쿠버네티스 관점의 본문이 오너 — 인프라 뷰 패널에 같은 목록을 두 번 두지 않는다 */}
            </>
          )}

          {resView === "list" && (
            /* 목록 — 종류 패널 + 표 전체 높이. 맵 없음. 좁은 화면은 세로 스택 + 종류 select */
            <div style={{ display: "flex", flexDirection: narrowList ? "column" : "row", gap: narrowList ? 12 : 16, alignItems: narrowList ? "stretch" : "flex-start" }}>
              {narrowList && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 12, padding: "8px 12px" }}>
                  <span style={{ fontSize: TYPE.label, fontWeight: 700, color: UI.ink3, flexShrink: 0 }}>종류</span>
                  <select aria-label="리소스 종류 선택" value={kindId} onChange={(e) => setKindId(e.currentTarget.value)}
                    style={{ flex: 1, minWidth: 0, fontSize: TYPE.body, color: UI.ink, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
                    {KINDS.map((k) => (
                      <option key={k.id} value={k.id}>{k.label}{kindCounts[k.id] != null ? ` (${kindCounts[k.id]})` : ""}</option>
                    ))}
                  </select>
                </label>
              )}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <kind.icon size={15} style={{ color: BLUE }} />
                  <span style={{ fontSize: TYPE.title3, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink }}>{kind.label}</span>
                  <span style={{ fontSize: TYPE.label, fontFamily: MONO, color: UI.ink3 }}>{shownRows.length}{shownRows.length !== allRows.length ? ` / ${allRows.length}` : ""}</span>
                  <span style={{ fontSize: TYPE.caption2, fontWeight: 600, color: inScope ? BLUE : UI.ink2, background: inScope ? blueA(0.08) : inkA(0.045), borderRadius: 999, padding: "3px 11px" }}>범위 · {scopeLabel}</span>
                </div>
                {/* 표 교체는 대기 없이 즉시 — exit를 기다리면 전환이 느리고, 탭 스로틀 시 멈춘다 */}
                <motion.div key={kindId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
                  {/* 라이브 인벤토리 상태를 정직하게 표시 — 데이터 없으면 관측 안 됨 */}
                  {resourcesView.status === "loading" ? (
                    <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: TYPE.body, color: UI.ink3 }}>불러오는 중…</div>
                  ) : resourcesView.status === "unavailable" ? (
                    <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: TYPE.body, color: UI.ink3 }}>인벤토리 관측 안 됨</div>
                  ) : (
                    <ResourceTable kind={kind} rows={shownRows} q={q}
                      filterDesc={[inScope ? `${scopeLabel}` : "", ns !== "모든 네임스페이스" ? `${ns} 네임스페이스` : ""].filter(Boolean).join(" · ")}
                      onClearFilter={() => { setQ(""); setNs("모든 네임스페이스"); }}
                      onOpen={(r) => setDetail({ kind, row: r })} />
                  )}
                </motion.div>
              </div>
              {/* 종류 선택 패널 — 지도 관점의 탐색 패널과 같은 KindIndex 하나를 공유(두 번째 구현 금지).
                  좁은 화면에서는 위 종류 select로 대체하고 사이드바를 렌더하지 않아 표를 가리지 않는다. */}
              {!narrowList && (
              <aside style={{ width: 248, flexShrink: 0, alignSelf: "flex-start", position: "sticky", top: topH + 12, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: 10, maxHeight: `calc(100vh / ${PRESENT_SCALE} - ${topH + 60}px)`, overflowY: "auto", scrollbarGutter: "stable" }}>
                <KindIndex sel={kindId} onPick={(k) => setKindId(k.id)} showEmpty={showEmpty} setShowEmpty={setShowEmpty} pinned={pinned} togglePin={togglePin} filter={q} counts={kindCounts} />
              </aside>
              )}
            </div>
          )}

          {resView === "flow" && (
            /* 트래픽 — 호출 그래프 + 보조 패널(서비스 상태·포커스, 세 관점 동일 문법). 서비스 클릭 = 상세 시트 */
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TopologyView embedded clusterIds={scope.cluster ? [scope.cluster] : clusterIds} focusId={trafficFocus} onFocusService={setTrafficFocus} onOpenService={openTrafficService} />
              </div>
              <TrafficPanel clusterIds={scope.cluster ? [scope.cluster] : clusterIds} focus={trafficFocus} onFocus={setTrafficFocus} onOpen={openTrafficService} stickyTop={topH + 12} />
            </div>
          )}
        </main>
      )}
      </div>

      {/* AI 어시스턴트 — 상세 페이지 위까지 덮는 우측 오버레이 + 폭 조절 핸들 */}
      <AnimatePresence>
        {aiOpen && (
          <motion.div key="ai" initial={{ x: aiW + 30 }} animate={{ x: 0 }} exit={{ x: aiW + 30 }} transition={{ type: "spring", bounce: 0.06, visualDuration: 0.34 }}
            style={{ position: "fixed", top: topH, right: 0, bottom: 0, width: aiW, zIndex: 72, display: "flex", boxShadow: `-28px 0 70px -32px ${inkA(0.3)}` }}>
            <div role="separator" aria-label="AI 패널 폭 조절" aria-orientation="vertical" onPointerDown={onAiHandleDown} title="드래그해서 폭 조절"
              style={{ width: 5, flexShrink: 0, cursor: "col-resize", background: aiDragging ? blueA(0.35) : "transparent", transition: "background .15s" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <AiPanel embedded onClose={() => setAiOpen(false)} contextView={surface === "connect" ? "연결 설정" : surface === "home" ? "홈" : surface === "deploy" ? "배포" : surface === "issues" ? "이슈" : surface === "timeline" ? "타임라인" : surface === "checks" ? "점검" : surface === "cost" ? "비용" : surface === "alerts" ? "알림" : surface === "ai" ? "AI 대화" : surface === "settings" ? "설정" : resView === "flow" ? "트래픽" : resView === "list" ? "쿠버네티스 리소스" : "인프라 지도"} contextScope={scope.cluster ?? "전체 클러스터"} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI 플로팅 버튼 — 항상 최상위(상세 위 포함) · AI 창이 열리면 사라진다 */}
      <AnimatePresence>
        {!aiOpen && (
          <motion.button type="button" aria-label="AI 어시스턴트 열기" key="fab" onClick={() => setAiOpen(true)} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.93 }}
            initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={SOFT}
            title="AI 어시스턴트"
            style={{ position: "fixed", right: 22, bottom: 22, zIndex: 75, width: 48, height: 48, borderRadius: 999, border: "none", cursor: "pointer",
              background: `linear-gradient(135deg, ${BLUE}, ${BLUE2})`, color: UI.card, display: "grid", placeItems: "center",
              boxShadow: `0 10px 26px -8px ${blueA(0.55)}, 0 2px 8px ${inkA(0.12)}` }}>
            <Sparkles size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* 환경 연결 — 문맥 모달. 위저드가 자체 백드롭·중앙정렬·스크롤을 소유(이중 모달 금지) */}
      <AnimatePresence>
        {connectModal && (
          <motion.div key="cmw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DUR.fade }}
            style={{ position: "fixed", top: topH, left: navCollapsed ? 60 : 208, right: 0, bottom: 0, zIndex: 69 }}>
            <ConnectWizard key={connectModal} embedded initialView={connectModal} onDismiss={() => setConnectModal(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 상세 — 최상위 레이어 오버레이 (Esc로 닫힘) */}
      <AnimatePresence>
        {detail && <DetailOverlay key={`${detail.kind.id}-${String(detail.row.cluster ?? "")}-${String(detail.row._key ?? detail.row.name)}`} kind={detail.kind} row={detail.row} onClose={() => setDetail(null)} onToast={pushToast} onOpenRef={openRef} onShowPods={(b) => { setDetail(null); setSurface("resources"); setResView("list"); setKindId("Pod"); setQ(b); }} forceFull={aiOpen} rightInset={aiOpen ? aiW : 0} leftInset={navCollapsed ? 60 : 208} topInset={topH} viewportW={vwCss} />}
      </AnimatePresence>
      {/* 이슈 RCA 사이드바 — 셸 레벨 렌더(서피스 transform 밖) */}
      <AnimatePresence>
        {rcaIncident && <IssueDetail key={rcaIncident.name} {...rcaIncident} topInset={topH} leftInset={navCollapsed ? 60 : 208}
          onClose={() => setRcaIncident(null)}
          onOpenRef={(k, n) => { setRcaIncident(null); openRef(k, n); }}
          onAskAi={() => { setRcaIncident(null); setAiOpen(true); }} />}
      </AnimatePresence>

      {/* 작업 토스트 — 우측 상단 스택 */}
      <div style={{ position: "fixed", top: topH + 10, right: 16, zIndex: 80, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: -14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={SOFT}
              style={{ display: "flex", alignItems: "center", gap: 10, width: 340, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 13, padding: "11px 13px", boxShadow: `0 16px 44px -16px ${inkA(0.3)}`, pointerEvents: "auto" }}>
              <span style={{ width: 26, height: 26, borderRadius: 9, background: t.tone === "ok" ? HP.ok : HP.crit, display: "grid", placeItems: "center", flexShrink: 0 }}>
                {t.tone === "ok" ? <Check size={14} color={UI.card} strokeWidth={3} /> : <AlertTriangle size={13} color={UI.card} />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: TYPE.body, fontWeight: 700, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                <span style={{ display: "block", fontSize: TYPE.caption2, color: UI.ink2, marginTop: 1 }}>{t.sub}</span>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <style>{`
        .uni { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
        .uni .krow { transition: background .14s ease; }
        .uni .krow:hover { background: ${inkA(0.045)}; }
        .uni .krow:hover .kpin { opacity: .5 !important; }
        .uni .rrow { transition: background .12s ease; }
        .uni .rrow:hover { background: ${inkA(0.028)}; }
        .uni .gnav:hover { background: ${inkA(0.05)} !important; }
        .uni .acard { transition: transform .12s ease, background .12s ease; }
        .uni .acard:not(:disabled):hover { background: ${UI.card} !important; transform: translateY(-1px); }
        /* YAML 구문 색상 — 라이트 코드 에디터 팔레트 (Badge 텍스트 톤과 동일 계열) */
        .uni .y-k { color: ${TINT.blue.fg}; }
        .uni .y-s { color: ${TINT.ok.fg}; }
        .uni .y-n { color: ${TINT.warn.fg}; }
        .uni .y-b { color: ${TINT.purple.fg}; }
        .uni .y-p { color: ${UI.ink3}; }
        .uni .y-c { color: ${UI.ink3}; font-style: italic; }
        .uni .y-del { color: ${TINT.crit.fg}; background: ${TINT.crit.bg}; }
        .uni .y-add { color: ${TINT.ok.fg}; background: ${TINT.ok.bg}; }
        .uni .livedot { animation: lv 1.6s ease-in-out infinite; }
        @keyframes lv { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .uni ::-webkit-scrollbar { width: 8px; } .uni ::-webkit-scrollbar-thumb { background: ${inkA(0.12)}; border-radius: 99px; }
        @media (prefers-reduced-motion: reduce) { .uni .livedot { animation: none !important; } }
        /* 좁은 화면(200% 확대 등): 부가 요소를 접어 핵심만 남긴다 */
        @media (max-width: 980px) { .uni .hide-narrow { display: none !important; } }
      `}</style>
    </div>
  );
}

// 단일 루트 엔트리(main.tsx)에서 마운트한다 —
// 모듈 로드 시 자체 마운트하지 않고 UnifiedApp 컴포넌트만 내보낸다.
export function UnifiedApp() {
  return (
    <DevpreviewContractProvider>
      <App />
    </DevpreviewContractProvider>
  );
}
