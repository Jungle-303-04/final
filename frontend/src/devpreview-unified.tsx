// ⚠ 데모 · 통합 리소스 — 리소스 종류 인덱스(전체 택소노미) + 종류별 표 + 물리/관계 관점.
// 병합 규칙: 좌측 = 무엇을(종류) · 상단 관점 = 어떻게(물리/관계/목록).
// 워크로드·노드 계열은 관점 전환이 가능하고, 나머지는 종류별 전용 표로 정보를 잃지 않게 표시.
import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Server, FileCog, Network, Globe, Search, KeyRound,
  Rocket, Database, Boxes, Copy, LayoutGrid, Play, Timer, Plug, DoorOpen, ShieldCheck, MoveDiagonal,
  HardDrive, Cpu, Folder, Activity, UserCog, Eye, Radio, ChevronDown, Pin,
  Home, ListTree, AlertTriangle, Share2, Clock, Package, GitBranch, Coins, Settings, Sparkles, PanelLeftClose, PanelLeftOpen, Moon, CircleHelp,
  Bell, Pencil, Check, Hourglass, Webhook, SignalHigh,
} from "lucide-react";
import { OpsiaMap, podInventory, nodeInventory, repoInventory } from "./devpreview-opsia";
import { AiPanel } from "./devpreview-ai";
import { ConnectWizard } from "./devpreview-connect";
import { TopologyView } from "./devpreview-topology";
import { UI, BLUE, HP, MONO, SOFT, EASE_DRAW, PRESENT_SCALE } from "./devpreview/theme";
import "./styles/tokens.css";
import "./styles/foundation.css";


// ── 목 데이터 ─────────────────────────────
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];
const age = (r: () => number) => { const d = Math.floor(r() * 14) + 1; return d > 1 ? `${d}d` : `${Math.floor(r() * 23) + 1}h`; };
// 이름 → 네임스페이스 결정 매핑 (임의 배정으로 인한 논리 모순 방지)
function nsFor(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith("argocd")) return "argocd";
  if (["coredns", "ebs-csi", "aws-node", "kube-proxy", "cluster-agent", "metrics-server"].some((s) => n.includes(s))) return "kube-system";
  if (n.includes("caretta")) return "caretta";
  if (n.includes("jsonnet")) return "argocd-demo-jsonnet";
  if (n.includes("guestbook")) return "argocd-demo-waves";
  if (n.startsWith("shop") || ["checkout", "payments", "search"].some((s) => n.startsWith(s))) return "shop";
  if (["auth", "gateway", "worker", "notifier", "media", "redis", "postgres", "backend"].some((s) => n.startsWith(s))) return "platform";
  return "sandbox";
}
// 이름 → 클러스터 결정 귀속 — 맵 드릴 범위와 표를 실제로 연동하기 위한 기준
function clusterOf(name: string): string {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 4 === 0 ? "dev-eks" : "prod-eks";
}
// 이미지를 이름 기반으로 결정 — 리소스 이름과 이미지가 어긋나는 논리 모순 방지
const imgFor = (name: string) => {
  const n = name.toLowerCase();
  if (n.startsWith("argocd")) return "quay.io/argoproj/argocd:v3.4.5";
  if (n.includes("redis")) return "redis:8.2.3-alpine";
  if (n.includes("dex")) return "dexidp/dex:v2.45.0";
  if (n.includes("grafana")) return "grafana/grafana:9.3.1";
  if (n.includes("coredns")) return "coredns/coredns:v1.12.4";
  if (n.includes("ebs-csi")) return "aws-ebs-csi-driver:v1.28.0";
  if (n.includes("guestbook") || n.includes("frontend")) return "gb-frontend:v5";
  if (n.includes("aws-node")) return "amazon-k8s-cni:v1.21.2";
  if (n.includes("kube-proxy")) return "kube-proxy:v1.34.6-eks";
  if (n.includes("node-exporter") || n.includes("prometheus")) return "node-exporter:v1.11.1";
  if (n.includes("loki")) return "grafana/loki:3.6.7";
  if (n.includes("caretta")) return "caretta:v0.0.16";
  return `registry.opsia.io/${name.split("-").slice(0, 2).join("-")}:v1.4.2`;
};

type Cell = { t: "text" } | { t: "mono" } | { t: "ns" } | { t: "ready" } | { t: "badge"; tone?: "blue" | "green" | "gray" | "purple" }
  | { t: "meter" } | { t: "dots" } | { t: "num" } | { t: "status" };
type Col = { k: string; label: string; w?: string; cell: Cell };
type Row = Record<string, unknown>;

// 종류별 컬럼 정의 — 레퍼런스 표 기준, 캡처 없는 종류는 같은 관점으로 추론
const SPEC: Record<string, { cols: Col[]; rows: (r: () => number) => Row[] }> = {
  Deployment: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "ready", label: "READY", w: "72px", cell: { t: "ready" } }, { k: "utd", label: "UP-TO-DATE", w: "96px", cell: { t: "num" } },
      { k: "avail", label: "AVAILABLE", w: "90px", cell: { t: "num" } }, { k: "img", label: "IMAGES", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
    rows: (r) => ["argocd-applicationset-controller", "argocd-dex-server", "argocd-notifications-controller", "argocd-redis", "argocd-repo-server", "argocd-server",
      "caretta-grafana", "cluster-agent", "coredns", "ebs-csi-controller", "jsonnet-guestbook-ui", "learning-guestbook-ui", "shop-api", "shop-web", "checkout", "payments", "search", "auth", "gateway", "worker", "notifier", "media"]
      .map((name) => ({ name, ns: nsFor(name), ready: r() < 0.9 ? "1/1" : "2/2", utd: 1, avail: 1, img: imgFor(name), age: age(r) })),
  },
  DaemonSet: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "desired", label: "DESIRED", w: "80px", cell: { t: "num" } }, { k: "ready", label: "READY", w: "72px", cell: { t: "ready" } },
      { k: "utd", label: "UP-TO-DATE", w: "96px", cell: { t: "num" } }, { k: "avail", label: "AVAILABLE", w: "90px", cell: { t: "num" } },
      { k: "img", label: "IMAGES", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
    rows: (r) => [["aws-node", "kube-system", 2], ["caretta", "caretta", 2], ["ebs-csi-node", "kube-system", 2], ["kube-proxy", "kube-system", 2], ["loki-canary", "target", 2],
      ["opentelemetry-collector", "target", 2], ["optional-node-collector", "target", 2], ["prometheus-prometheus-node-exporter", "target", 2], ["ebs-csi-node-windows", "kube-system", 0]]
      .map(([name, ns, n]) => ({ name, ns, desired: n, ready: `${n}`, utd: n, avail: n, img: imgFor(name as string), age: age(r), bad: n === 0 })),
  },
  StatefulSet: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "ready", label: "READY", w: "72px", cell: { t: "ready" } }, { k: "utd", label: "UP-TO-DATE", w: "96px", cell: { t: "num" } },
      { k: "img", label: "IMAGES", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
    rows: (r) => [["argocd-application-controller", "argocd", "quay.io/argoproj/argocd:v3.4.5"], ["caretta-vm", "caretta", "victoria-metrics:v1.85.3"], ["loki", "target", "grafana/loki:3.6.7"],
      ["prometheus-alertmanager", "target", "alertmanager:v0.33.0"], ["tempo", "target", "grafana/tempo:2.9.0"]]
      .map(([name, ns, img]) => ({ name, ns, ready: "1/1", utd: 1, img, age: age(r) })),
  },
  Pod: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } },
      { k: "ctr", label: "CONTAINERS", w: "92px", cell: { t: "dots" } }, { k: "status", label: "STATUS", w: "92px", cell: { t: "status" } },
      { k: "cpu", label: "CPU", w: "128px", cell: { t: "meter" } }, { k: "mem", label: "MEMORY", w: "128px", cell: { t: "meter" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    // 파드는 맵과 같은 인벤토리에서 파생 — 드릴 맵에 보이는 파드가 곧 이 표의 파드다
    // 정렬도 맵과 동일 규칙: 임계 → 실행 중 → 대기
    rows: () => podInventory().sort((a, b) => (a.bad ? 0 : a.status === "Pending" ? 2 : 1) - (b.bad ? 0 : b.status === "Pending" ? 2 : 1)).map((p) => ({
      name: p.name, ns: p.ns, svc: p.svc, ownerKind: p.ownerKind, cfgs: p.cfgs, qos: p.qos, node: p.node, cluster: p.cluster, restarts: p.restarts,
      img: imgFor(p.svc), ctr: 1 + (p.name.length % 3), status: p.status, bad: p.bad,
      cpu: { used: `${p.cpu * 4}m`, lim: "400m", pct: p.cpu }, mem: { used: `${p.mem * 3}Mi`, lim: "300Mi", pct: p.mem },
      age: `${3 + (p.cpu % 9)}d`,
    })),
  },
  ReplicaSet: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.7fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "ready", label: "READY", w: "72px", cell: { t: "ready" } }, { k: "owner", label: "OWNER", w: "minmax(150px,1fr)", cell: { t: "mono" } },
      { k: "st", label: "STATUS", w: "76px", cell: { t: "badge", tone: "blue" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => ["argocd-applicationset-controller-69bddf5587", "argocd-dex-server-779bbb6b9d", "argocd-notifications-controller-7494d5f69f", "argocd-redis-74d7d69cc8",
      "argocd-repo-server-674d585b64", "argocd-server-bb74d4fbb", "backend", "caretta-grafana-5dcb88d5dc", "cluster-agent-57bbdcbd6d", "coredns-5f7cf6bc58", "ebs-csi-controller-8667755b8d"]
      .map((name) => ({ name, ns: nsFor(name), ready: "1/1", owner: name.includes("backend") ? "–" : `Deployment/${name.split("-").slice(0, 3).join("-")}`, st: "Active", age: age(r) })),
  },
  Job: {
    cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "170px", cell: { t: "ns" } },
      { k: "st", label: "STATUS", w: "92px", cell: { t: "badge", tone: "blue" } }, { k: "comp", label: "COMPLETIONS", w: "108px", cell: { t: "ready" } },
      { k: "dur", label: "DURATION", w: "84px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => [["maint-page-down", "6s"], ["maint-page-up", "7s"], ["upgrade-sql-schema8088f4c-presync-1783939262", "11s"]]
      .map(([name, dur]) => ({ name, ns: "argocd-demo-waves", st: "Complete", comp: "1/1", dur, age: age(r) })),
  },
  // 아래 5종은 kubectl 표준 컬럼(k8s printers.go) 기준 — 추론이 아니라 정본
  CronJob: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } },
      { k: "sched", label: "SCHEDULE", w: "100px", cell: { t: "mono" } }, { k: "tz", label: "TIMEZONE", w: "92px", cell: { t: "text" } },
      { k: "susp", label: "SUSPEND", w: "78px", cell: { t: "text" } }, { k: "active", label: "ACTIVE", w: "68px", cell: { t: "num" } },
      { k: "last", label: "LAST SCHEDULE", w: "104px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: () => [{ name: "backup-snapshots", ns: "platform", sched: "0 3 * * *", tz: "Asia/Seoul", susp: "False", active: 0, last: "6h", age: "12d" }],
  },
  Service: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.5fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "type", label: "TYPE", w: "92px", cell: { t: "badge", tone: "blue" } }, { k: "sel", label: "SELECTOR", w: "minmax(140px,1fr)", cell: { t: "mono" } },
      { k: "ep", label: "ENDPOINTS", w: "92px", cell: { t: "badge", tone: "green" } }, { k: "ports", label: "PORTS", w: "120px", cell: { t: "mono" } }, { k: "ext", label: "EXTERNAL", w: "76px", cell: { t: "text" } }],
    rows: (r) => ["argocd-applicationset-controller", "argocd-dex-server", "argocd-metrics", "argocd-notifications-controller", "argocd-redis", "argocd-repo-server",
      "argocd-server", "argocd-server-metrics", "backend", "caretta-grafana", "caretta-vm", "shop-api", "checkout", "payments", "search", "auth", "gateway"]
      .map((name) => ({ name, ns: nsFor(name), type: "ClusterIP", sel: pick(r, ["app.kubernetes.io/nam…", "tier=backend", "app=server, app.kubern…"]),
        ep: "Active", ports: pick(r, ["8082", "9001", "6379", "8081, 8084", "80:8080, 443:8080", "80:3000", "8428:http"]), ext: "–" })),
  },
  Ingress: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.5fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "class", label: "CLASS", w: "96px", cell: { t: "badge", tone: "gray" } }, { k: "hosts", label: "HOSTS", w: "minmax(140px,1fr)", cell: { t: "mono" } },
      { k: "addr", label: "ADDRESS", w: "130px", cell: { t: "mono" } }, { k: "ports", label: "PORTS", w: "80px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    // 외부 노출은 gateway 하나 — 맵의 gateway 서비스(platform)와 일치
    rows: () => [{ name: "gateway", ns: "platform", class: "alb", hosts: "shop.opsia.io", addr: "k8s-platform-…elb.amazonaws.com", ports: "80, 443", age: "12d" }],
  },
  NetworkPolicy: {
    cols: [{ k: "name", label: "NAME", w: "minmax(220px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } },
      { k: "types", label: "TYPES", w: "92px", cell: { t: "text" } }, { k: "sel", label: "POD SELECTOR", w: "minmax(150px,1fr)", cell: { t: "mono" } },
      { k: "rules", label: "RULES", w: "84px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => ["argocd-application-controller", "argocd-applicationset-controller", "argocd-dex-server", "argocd-notifications-controller", "argocd-redis", "argocd-repo-server", "argocd-server"]
      .map((n) => ({ name: `${n}-network-policy`, ns: "argocd", types: "Ingress", sel: "app.kubernetes.io/nam…", rules: pick(r, ["1i / 0e", "2i / 0e"]), age: "4d" })),
  },
  EndpointSlice: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "at", label: "ADDRESSTYPE", w: "108px", cell: { t: "badge", tone: "gray" } }, { k: "ports", label: "PORTS", w: "110px", cell: { t: "mono" } },
      { k: "ep", label: "ENDPOINTS", w: "minmax(120px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    // EndpointSlice는 Service마다 1개 — Service 표와 같은 시드로 파생해 이름·포트가 항상 일치
    rows: () => SPEC.Service.rows(rng("Service".length * 977 + 13)).map((s, i) => ({
      name: `${s.name}-${["x7k2p", "m4qnd", "r9wzt", "k2vhc", "p6sjm"][i % 5]}`, ns: s.ns, at: "IPv4",
      ports: String(s.ports), ep: `10.0.${1 + (i % 4)}.${30 + i * 3}`, age: `${3 + (i % 10)}d`,
    })),
  },
  ConfigMap: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "180px", cell: { t: "ns" } },
      { k: "keys", label: "KEYS", w: "minmax(160px,1fr)", cell: { t: "mono" } }, { k: "size", label: "SIZE", w: "76px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => [["amazon-vpc-cni", "kube-system", "7 (branch-eni-cooldown, ena…", "20 B"], ["appset-demo", "argocd-demo-appset-…", "1 (source)", "5 B"],
      ["argocd-cm", "argocd", "9 (resource.customizations.ig…", "2.6 KB"], ["argocd-cmd-params-cm", "argocd", "1 (server.insecure)", "4 B"],
      ["argocd-gpg-keys-cm", "argocd", "0", "0 B"], ["argocd-notifications-cm", "argocd", "0", "0 B"], ["argocd-rbac-cm", "argocd", "0", "0 B"],
      ["argocd-ssh-known-hosts-cm", "argocd", "1 (ssh_known_hosts)", "4 KB"], ["argocd-tls-certs-cm", "argocd", "0", "0 B"], ["app-config", "shop", "6 (feature.flags, api.base…", "1.2 KB"]]
      .map(([name, ns, keys, size]) => ({ name, ns, keys, size, age: age(r) })),
  },
  Secret: {
    cols: [{ k: "name", label: "NAME", w: "minmax(220px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "type", label: "TYPE", w: "104px", cell: { t: "badge", tone: "purple" } }, { k: "keys", label: "KEYS", w: "72px", cell: { t: "num" } },
      { k: "exp", label: "EXPIRES", w: "84px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => [["argocd-example-apps", "argocd", "Opaque", 4], ["argocd-initial-admin-secret", "argocd", "Opaque", 1], ["argocd-notifications-secret", "argocd", "Opaque", 0],
      ["argocd-redis", "argocd", "Opaque", 1], ["argocd-secret", "argocd", "Opaque", 5], ["caretta-grafana", "caretta", "Opaque", 3], ["ghcr-pull-secret", "sandbox", "Docker", 1],
      ["sh.helm.release.v1.caretta.v1", "caretta", "release.v1", 1], ["sh.helm.release.v1.caretta.v2", "caretta", "release.v1", 1], ["db-credentials", "shop", "Opaque", 2]]
      .map(([name, ns, type, keys]) => ({ name, ns, type, keys, exp: "–", age: age(r) })),
  },
  HPA: {
    cols: [{ k: "name", label: "NAME", w: "minmax(170px,1.5fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } },
      { k: "ref", label: "REFERENCE", w: "minmax(150px,1fr)", cell: { t: "mono" } }, { k: "targets", label: "TARGETS", w: "110px", cell: { t: "mono" } },
      { k: "min", label: "MINPODS", w: "78px", cell: { t: "num" } }, { k: "max", label: "MAXPODS", w: "78px", cell: { t: "num" } },
      { k: "reps", label: "REPLICAS", w: "82px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    // HPA 현재 복제 수·사용률은 파드 인벤토리에서 계산 — 맵의 shop-api 파드 수와 일치
    rows: () => {
      const pods = podInventory().filter((p) => p.svc === "shop-api");
      const avg = pods.length ? Math.round(pods.reduce((s, p) => s + p.cpu, 0) / pods.length) : 0;
      return [{ name: "shop-api", ns: "shop", ref: "Deployment/shop-api", targets: `cpu: ${avg}%/70%`, min: 2, max: 20, reps: pods.length, age: "9d" }];
    },
  },
  PVC: {
    cols: [{ k: "name", label: "NAME", w: "minmax(160px,1.4fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "130px", cell: { t: "ns" } },
      { k: "st", label: "STATUS", w: "86px", cell: { t: "badge", tone: "green" } }, { k: "vol", label: "VOLUME", w: "minmax(130px,1fr)", cell: { t: "mono" } },
      { k: "cap", label: "CAPACITY", w: "84px", cell: { t: "text" } }, { k: "am", label: "ACCESS MODES", w: "108px", cell: { t: "mono" } },
      { k: "sc", label: "STORAGECLASS", w: "108px", cell: { t: "badge", tone: "gray" } }, { k: "vac", label: "VOLUMEATTRIBUTESCLASS", w: "150px", cell: { t: "text" } },
      { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: () => [],
  },
  ClusterRole: {
    cols: [{ k: "name", label: "NAME", w: "minmax(260px,3fr)", cell: { t: "text" } }, { k: "rules", label: "RULES", w: "84px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
    rows: (r) => [["admin", 28], ["argocd-application-controller", 2], ["argocd-applicationset-controller", 7], ["argocd-server", 6], ["aws-node", 9], ["caretta", 12],
      ["caretta-grafana-clusterrole", 0], ["caretta-victoria-metrics-single-clusterrole", 4], ["cluster-admin", 2], ["cluster-agent-gitops-control", 4], ["cluster-agent-node-control", 1], ["cluster-agent-read", 12]]
      .map(([name, rules]) => ({ name, rules, age: age(r) })),
  },
  ClusterRoleBinding: {
    cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "role", label: "ROLE", w: "minmax(160px,1.2fr)", cell: { t: "mono" } },
      { k: "subj", label: "SUBJECTS", w: "100px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
    rows: (r) => ["argocd-application-controller", "argocd-applicationset-controller", "argocd-server", "aws-node", "caretta", "caretta-grafana-clusterrolebinding",
      "caretta-victoria-metrics-single-clusterrolebinding", "cluster-admin", "cluster-agent-gitops-control", "cluster-agent-node-control", "cluster-agent-read"]
      .map((name) => ({ name, role: `CR ${name.replace("binding", "")}`, subj: name === "cluster-admin" ? "grp:sy…" : "sa:arg…", age: age(r) })),
  },
  Role: {
    cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "rules", label: "RULES", w: "84px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
    rows: (r) => [["argocd-application-controller", "argocd", 4], ["argocd-applicationset-controller", "argocd", 7], ["argocd-dex-server", "argocd", 1],
      ["argocd-notifications-controller", "argocd", 4], ["argocd-redis", "argocd", 2], ["argocd-server", "argocd", 3], ["bot-service-01-api-observer", "sandbox", 4],
      ["caretta-grafana", "caretta", 0], ["caretta-victoria-metrics-single", "caretta", 0], ["cluster-agent-catalog-install", "sandbox", 4], ["cluster-agent-cronjob-control", "sandbox", 2]]
      .map(([name, ns, rules]) => ({ name, ns, rules, age: age(r) })),
  },
  RoleBinding: {
    cols: [{ k: "name", label: "NAME", w: "minmax(220px,2.2fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } },
      { k: "role", label: "ROLE", w: "minmax(150px,1.2fr)", cell: { t: "mono" } }, { k: "subj", label: "SUBJECTS", w: "92px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => [["argocd-application-controller", "argocd"], ["argocd-applicationset-controller", "argocd"], ["argocd-dex-server", "argocd"], ["argocd-notifications-controller", "argocd"],
      ["argocd-redis", "argocd"], ["argocd-server", "argocd"], ["bot-service-01-api-observer", "sandbox"], ["caretta-grafana", "caretta"], ["cluster-agent-catalog-install", "sandbox"]]
      .map(([name, ns]) => ({ name, ns, role: `R ${name}`, subj: "sa:arg…", age: age(r) })),
  },
  ServiceAccount: {
    cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } },
      { k: "auto", label: "AUTOMOUNT", w: "110px", cell: { t: "badge", tone: "gray" } }, { k: "sec", label: "SECRETS", w: "84px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => [["argocd-application-controller", "argocd"], ["argocd-applicationset-controller", "argocd"], ["argocd-dex-server", "argocd"], ["argocd-notifications-controller", "argocd"],
      ["argocd-redis", "argocd"], ["argocd-repo-server", "argocd"], ["argocd-server", "argocd"], ["attachdetach-controller", "kube-system"], ["aws-cloud-provider", "kube-system"],
      ["aws-node", "kube-system"], ["bot-service-01-api", "sandbox"], ["caretta", "caretta"]]
      .map(([name, ns]) => ({ name, ns, auto: "Yes", sec: 0, age: age(r) })),
  },
  Event: {
    cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.5fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "120px", cell: { t: "ns" } },
      { k: "type", label: "TYPE", w: "84px", cell: { t: "badge", tone: "green" } }, { k: "reason", label: "REASON", w: "120px", cell: { t: "text" } },
      { k: "msg", label: "MESSAGE", w: "minmax(200px,1.6fr)", cell: { t: "text" } }, { k: "obj", label: "OBJECT", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "cnt", label: "COUNT", w: "64px", cell: { t: "num" } }],
    rows: () => [["Started", "Started container node-collector", "Pod/optional-node-col…"], ["Scheduled", "Successfully assigned target/opti…", "Pod/optional-node-col…"],
      ["Pulled", 'Container image "183548421506…', "Pod/optional-node-col…"], ["Created", "Created container: node-collector", "Pod/optional-node-col…"],
      ["SuccessfulCreate", "Created pod: optional-node-coll…", "DaemonSet/optional-n…"], ["Killing", "Stopping container node-collect…", "Pod/optional-node-col…"],
      ["SuccessfulDelete", "Deleted pod: optional-node-coll…", "DaemonSet/optional-n…"], ["BackOff", "Back-off restarting failed container", "Pod/payments-4f2…"]]
      .map(([reason, msg, obj], i) => ({ name: "optional-node-collecto…", ns: "target", type: i === 7 ? "Warning" : "Normal", reason, msg, obj, cnt: 1, bad: i === 7 })),
  },
  Namespace: {
    cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "text" } },
      { k: "st", label: "STATUS", w: "92px", cell: { t: "badge", tone: "green" } }, { k: "age", label: "AGE", w: "60px", cell: { t: "text" } }],
    rows: (r) => ["argocd", "argocd-demo-appset-dev", "argocd-demo-appset-stage", "argocd-demo-git-app-a", "argocd-demo-git-app-b", "argocd-demo-helm", "argocd-demo-hooks",
      "argocd-demo-jsonnet", "argocd-demo-kustomize", "argocd-demo-multi-source", "argocd-demo-waves", "caretta", "kube-system", "sandbox", "shop", "platform", "target"]
      .map((name) => ({ name, ns: "–", st: "Active", age: age(r) })),
  },
  // 추가 종류 — kubectl 표준 컬럼
  Endpoints: { cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "160px", cell: { t: "ns" } }, { k: "eps", label: "ENDPOINTS", w: "minmax(160px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], rows: () => [] },
  PodDisruptionBudget: { cols: [{ k: "name", label: "NAME", w: "minmax(180px,1.6fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "150px", cell: { t: "ns" } }, { k: "min", label: "MIN AVAILABLE", w: "108px", cell: { t: "mono" } }, { k: "max", label: "MAX UNAVAILABLE", w: "120px", cell: { t: "mono" } }, { k: "dis", label: "ALLOWED DISRUPTIONS", w: "140px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => [["argocd-server", "argocd", "1", "N/A", 1], ["argocd-repo-server", "argocd", "1", "N/A", 1], ["coredns", "kube-system", "1", "N/A", 1]].map(([name, ns, min, max, dis]) => ({ name, ns, min, max, dis, age: age(r) })) },
  Lease: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "160px", cell: { t: "ns" } }, { k: "holder", label: "HOLDER", w: "minmax(160px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], rows: () => [] },
  MutatingWebhookConfiguration: { cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "hooks", label: "WEBHOOKS", w: "92px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], rows: () => [] },
  ValidatingWebhookConfiguration: { cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "hooks", label: "WEBHOOKS", w: "92px", cell: { t: "num" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], rows: () => [] },
  PriorityClass: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "value", label: "VALUE", w: "110px", cell: { t: "num" } }, { k: "gd", label: "GLOBAL-DEFAULT", w: "120px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], rows: () => [] },
  RuntimeClass: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "handler", label: "HANDLER", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], rows: () => [] },
  StorageClass: { cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.8fr)", cell: { t: "text" } }, { k: "prov", label: "PROVISIONER", w: "minmax(150px,1fr)", cell: { t: "mono" } }, { k: "rec", label: "RECLAIMPOLICY", w: "114px", cell: { t: "badge", tone: "gray" } }, { k: "vbm", label: "VOLUMEBINDINGMODE", w: "140px", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => [["gp2", "kubernetes.io/aws-ebs", "Delete", "WaitForFirstConsumer"]].map(([name, prov, rec, vbm]) => ({ name, prov, rec, vbm, age: age(r) })) },
  VolumeAttachment: { cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "att", label: "ATTACHER", w: "minmax(130px,1fr)", cell: { t: "mono" } }, { k: "pv", label: "PV", w: "minmax(130px,1fr)", cell: { t: "mono" } }, { k: "node", label: "NODE", w: "150px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }], rows: () => [] },
  Application: { cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.8fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "120px", cell: { t: "ns" } }, { k: "sync", label: "SYNC", w: "96px", cell: { t: "badge", tone: "green" } }, { k: "health", label: "HEALTH", w: "96px", cell: { t: "badge", tone: "green" } }, { k: "rev", label: "REVISION", w: "100px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => ["06-sync-waves", "argocd-demo-git-app-a", "argocd-demo-helm", "argocd-demo-jsonnet", "argocd-demo-kustomize", "argocd-demo-hooks", "argocd-demo-multi-source"].map((name) => ({ name, ns: "argocd", sync: "Synced", health: "Healthy", rev: pick(r, ["a3f92c1", "7d21e08", "c4d1f90"]), age: age(r) })) },
  ApplicationSet: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } }, { k: "gens", label: "GENERATORS", w: "110px", cell: { t: "mono" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => [["appset-dev", "argocd", "git"], ["appset-stage", "argocd", "list"]].map(([name, ns, gens]) => ({ name, ns, gens, age: age(r) })) },
  AppProject: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "ns", label: "NAMESPACE", w: "140px", cell: { t: "ns" } }, { k: "desc", label: "DESCRIPTION", w: "minmax(150px,1fr)", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => [["default", "argocd", "기본 프로젝트"], ["demo", "argocd", "데모 앱 그룹"]].map(([name, ns, desc]) => ({ name, ns, desc, age: age(r) })) },
  CNINode: { cols: [{ k: "name", label: "NAME", w: "minmax(220px,2fr)", cell: { t: "text" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    // CNINode는 클러스터에 조인된 노드마다 1개 — 프로비저닝 중인 노드에는 아직 없다
    rows: (r) => nodeInventory().filter((n) => n.state !== "Provisioning").map((n) => ({ name: `${n.id}.ap-northeast-2.compute.internal`, cluster: n.cluster, age: age(r) })) },
  APIService: { cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "svc", label: "SERVICE", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "avail", label: "AVAILABLE", w: "96px", cell: { t: "badge", tone: "green" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => ["v1.", "v1.apps", "v1.batch", "v1beta1.metrics.k8s.io", "v1.argoproj.io", "v1alpha1.argoproj.io"].map((name) => ({ name, svc: name.includes("metrics") ? "kube-system/metrics-server" : "Local", avail: "True", age: age(r) })) },
  Node: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.6fr)", cell: { t: "text" } }, { k: "st", label: "STATUS", w: "96px", cell: { t: "status" } },
      { k: "inst", label: "INSTANCE", w: "96px", cell: { t: "mono" } }, { k: "cpu", label: "CPU", w: "150px", cell: { t: "meter" } },
      { k: "mem", label: "MEMORY", w: "150px", cell: { t: "meter" } }, { k: "pods", label: "PODS", w: "140px", cell: { t: "meter" } }, { k: "zone", label: "ZONE", w: "76px", cell: { t: "mono" } }],
    // 노드도 맵과 같은 인벤토리 — 맵의 노드 카드와 이 표의 행이 1:1, 정렬도 동일 규칙(가동→예약→차단)
    rows: () => nodeInventory().sort((a, b) => (a.state === "Ready" ? 0 : a.state === "Provisioning" ? 1 : 2) - (b.state === "Ready" ? 0 : b.state === "Provisioning" ? 1 : 2)).map((n) => ({
      name: n.id, cluster: n.cluster, st: n.state, inst: n.instance, zone: n.zone,
      cpu: { used: `${n.cpu * 40}m`, lim: "4000m", pct: n.cpu }, mem: { used: `${(n.mem * 0.16).toFixed(1)}Gi`, lim: "16Gi", pct: n.mem },
      pods: { used: String(n.podCount), lim: String(n.cap), pct: Math.round((n.podCount / n.cap) * 100) },
    })),
  },
};

// ── 종류 인덱스 (레퍼런스 구조 그대로) ─────────────────────────────
type KindView = "physical" | "relation" | "table";
type Kind = { id: string; label: string; icon: typeof Rocket; group: string; view: KindView; count: number };
// 그룹·종류·개수는 실제 기준 인스턴스(cluster-1)에서 확인한 값 그대로
const GROUPS = ["워크로드", "네트워킹", "구성", "스토리지", "접근 제어", "클러스터", "ARGO", "AWS VPC CNI", "API 등록"] as const;
const BASE_KINDS: Kind[] = [
  { id: "CronJob", label: "CronJob", icon: Timer, group: "워크로드", view: "table", count: 1 },
  { id: "DaemonSet", label: "DaemonSet", icon: LayoutGrid, group: "워크로드", view: "table", count: 9 },
  { id: "Deployment", label: "Deployment", icon: Rocket, group: "워크로드", view: "physical", count: 22 },
  { id: "Job", label: "Job", icon: Play, group: "워크로드", view: "table", count: 3 },
  { id: "Pod", label: "Pod", icon: Boxes, group: "워크로드", view: "physical", count: 49 },
  { id: "ReplicaSet", label: "ReplicaSet", icon: Copy, group: "워크로드", view: "table", count: 38 },
  { id: "StatefulSet", label: "StatefulSet", icon: Database, group: "워크로드", view: "physical", count: 5 },
  { id: "Endpoints", label: "Endpoints", icon: Radio, group: "네트워킹", view: "table", count: 0 },
  { id: "EndpointSlice", label: "EndpointSlice", icon: Radio, group: "네트워킹", view: "table", count: 37 },
  { id: "Ingress", label: "Ingress", icon: DoorOpen, group: "네트워킹", view: "relation", count: 1 },
  { id: "NetworkPolicy", label: "NetworkPolicy", icon: ShieldCheck, group: "네트워킹", view: "table", count: 7 },
  { id: "Service", label: "Service", icon: Plug, group: "네트워킹", view: "relation", count: 35 },
  { id: "ConfigMap", label: "ConfigMap", icon: FileCog, group: "구성", view: "table", count: 50 },
  { id: "HPA", label: "HorizontalPodAutoscaler", icon: MoveDiagonal, group: "구성", view: "table", count: 1 },
  { id: "Lease", label: "Lease", icon: Hourglass, group: "구성", view: "table", count: 0 },
  { id: "MutatingWebhookConfiguration", label: "MutatingWebhookConfiguration", icon: Webhook, group: "구성", view: "table", count: 0 },
  { id: "PodDisruptionBudget", label: "PodDisruptionBudget", icon: ShieldCheck, group: "구성", view: "table", count: 3 },
  { id: "PriorityClass", label: "PriorityClass", icon: SignalHigh, group: "구성", view: "table", count: 0 },
  { id: "RuntimeClass", label: "RuntimeClass", icon: Cpu, group: "구성", view: "table", count: 0 },
  { id: "Secret", label: "Secret", icon: KeyRound, group: "구성", view: "table", count: 19 },
  { id: "ValidatingWebhookConfiguration", label: "ValidatingWebhookConfiguration", icon: Webhook, group: "구성", view: "table", count: 0 },
  { id: "PVC", label: "PersistentVolumeClaim", icon: HardDrive, group: "스토리지", view: "table", count: 1 },
  { id: "StorageClass", label: "StorageClass", icon: HardDrive, group: "스토리지", view: "table", count: 1 },
  { id: "VolumeAttachment", label: "VolumeAttachment", icon: HardDrive, group: "스토리지", view: "table", count: 0 },
  { id: "ClusterRole", label: "ClusterRole", icon: ShieldCheck, group: "접근 제어", view: "table", count: 107 },
  { id: "ClusterRoleBinding", label: "ClusterRoleBinding", icon: ShieldCheck, group: "접근 제어", view: "table", count: 92 },
  { id: "Role", label: "Role", icon: ShieldCheck, group: "접근 제어", view: "table", count: 34 },
  { id: "RoleBinding", label: "RoleBinding", icon: ShieldCheck, group: "접근 제어", view: "table", count: 35 },
  { id: "ServiceAccount", label: "ServiceAccount", icon: UserCog, group: "접근 제어", view: "table", count: 85 },
  { id: "Event", label: "Event", icon: Activity, group: "클러스터", view: "table", count: 60 },
  { id: "Namespace", label: "Namespace", icon: Folder, group: "클러스터", view: "table", count: 20 },
  { id: "Node", label: "Node", icon: Cpu, group: "클러스터", view: "physical", count: 2 },
  { id: "Application", label: "Application", icon: Rocket, group: "ARGO", view: "table", count: 11 },
  { id: "ApplicationSet", label: "ApplicationSet", icon: Copy, group: "ARGO", view: "table", count: 2 },
  { id: "AppProject", label: "AppProject", icon: Folder, group: "ARGO", view: "table", count: 2 },
  { id: "CNINode", label: "CNINode", icon: Network, group: "AWS VPC CNI", view: "table", count: 2 },
  { id: "APIService", label: "APIService", icon: Plug, group: "API 등록", view: "table", count: 30 },
];
// 사이드바 카운트 = 실제 표 행 수 — 숫자와 표가 어긋나는 논리 모순을 구조적으로 차단
const KINDS: Kind[] = BASE_KINDS.map((k) => ({ ...k, count: SPEC[k.id] ? SPEC[k.id].rows(rng(k.id.length * 977 + 13)).length : 0 }));
const GROUP_TOTAL = (g: string) => KINDS.filter((k) => k.group === g).reduce((s, k) => s + k.count, 0);

// ── 셀 렌더러 ─────────────────────────────
function CellView({ cell, v, bad }: { cell: Cell; v: unknown; bad?: boolean }) {
  if (cell.t === "meter") {
    const m = v as { used: string; lim: string; pct: number };
    const c = m.pct >= 90 ? HP.crit : m.pct >= 60 ? HP.warn : HP.ok;
    return (
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 11.5, fontFamily: MONO, color: UI.ink2, whiteSpace: "nowrap" }}>{m.used} / {m.lim} <span style={{ color: UI.ink3 }}>{m.pct}%</span></span>
        <span style={{ height: 3, borderRadius: 999, background: "rgba(17,19,24,0.07)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${m.pct}%`, background: c, borderRadius: 999 }} />
        </span>
      </span>
    );
  }
  if (cell.t === "dots") {
    const n = v as number;
    return <span style={{ display: "flex", gap: 3 }}>{Array.from({ length: n }).map((_, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 999, background: bad && i === 0 ? HP.crit : i === 0 && n > 1 ? "#D6DAE1" : HP.ok }} />)}</span>;
  }
  if (cell.t === "ready") return <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 600, color: bad ? HP.crit : "#1F9D4D" }}>{String(v)}</span>;
  if (cell.t === "status") {
    const s = String(v);
    const tone = bad || /Crash|OOM|Fail|Error|Evict/.test(s) ? "red" : /Pending|Provisioning/.test(s) ? "blue" : /Cordoned|Suspend|Terminat/.test(s) ? "gray" : "green";
    return <Badge text={s} tone={tone} />;
  }
  if (cell.t === "badge") return <Badge text={String(v)} tone={bad ? "red" : cell.tone ?? "gray"} />;
  if (cell.t === "num") return <span style={{ fontSize: 12.5, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: UI.ink2 }}>{String(v)}</span>;
  if (cell.t === "ns") return <span style={{ fontSize: 12.5, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v)}</span>;
  if (cell.t === "mono") return <span style={{ fontSize: 12, fontFamily: MONO, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v)}</span>;
  return <span style={{ fontSize: 12.5, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v)}</span>;
}
function Badge({ text, tone }: { text: string; tone: "blue" | "green" | "gray" | "purple" | "red" }) {
  const S = { blue: ["#0A6CFF", "#EDF4FF", "#CFE1FB"], green: ["#1F9D4D", "#EDFAF1", "#C9EAD4"], gray: ["#5F6570", "#F4F5F7", "#E4E6EA"], purple: ["#8250DF", "#F6F1FE", "#E3D5FA"], red: ["#C43028", "#FFF3F2", "#F5CFCC"] }[tone];
  return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: S[0], background: S[1], border: `1px solid ${S[2]}`, borderRadius: 5, padding: "1.5px 7px", whiteSpace: "nowrap" }}>{text}</span>;
}

// ── 종류별 표 ─────────────────────────────
// 검색어 매치 하이라이트 — 무엇이 걸렸는지 눈으로 바로 보인다
function Hi({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<span style={{ background: "#FFF1B8", borderRadius: 3, padding: "0 1px" }}>{text.slice(i, i + q.length)}</span>{text.slice(i + q.length)}</>;
}

function ResourceTable({ kind, rows, q, inScope, dense, onOpen }: { kind: Kind; rows: Row[]; q: string; inScope: boolean; dense: boolean; onOpen: (r: Row) => void }) {
  const spec = SPEC[kind.id];
  if (!spec) return null;
  const filtered = rows;
  /* 가로 스크롤 금지 — 고정폭 컬럼을 minmax로 감싸 컨테이너에 항상 맞춘다 */
  const grid = spec.cols.map((c) => { const w = c.w ?? "1fr"; return w.endsWith("px") ? `minmax(48px, ${w})` : w; }).join(" ");
  const rowPad = dense ? "5px 16px" : "9px 16px";
  return (
    /* 긴 표는 카드 안에서 세로 스크롤(헤더 고정) */
    <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, overflowY: "auto", overflowX: "hidden", maxHeight: "min(64vh, 680px)", scrollbarGutter: "stable" }}>
    <div>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 14, padding: "10px 16px", borderBottom: `1px solid ${UI.line}`, background: "#FCFCFD", position: "sticky", top: 0, zIndex: 2 }}>
        {spec.cols.map((c) => (
          <span key={c.k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.05em", color: UI.ink3 }}>
            {c.label}<ChevronDown size={9} style={{ opacity: 0.5 }} />
          </span>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: "40px 18px", textAlign: "center", fontSize: 13, color: UI.ink3 }}>
          {q ? "검색 결과가 없습니다" : inScope ? `이 범위에는 ${kind.label} 리소스가 없습니다` : `${kind.label} 리소스가 없습니다`}
        </div>
      ) : filtered.map((row, i) => (
        <motion.div key={`${kind.id}-${String(row.name)}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: Math.min(i, 10) * 0.022 }}
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
  { id: "overview", label: "개요" }, { id: "yaml", label: "YAML" }, { id: "related", label: "관련 리소스" },
  { id: "events", label: "이벤트" }, { id: "logs", label: "로그" }, { id: "rbac", label: "권한" },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]["id"];
const TABS_FOR = (kindId: string): DetailTab[] => {
  if (kindId === "Pod") return ["overview", "yaml", "related", "events", "logs", "rbac"];
  if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"].includes(kindId)) return ["overview", "yaml", "related", "events", "logs", "rbac"];
  if (["ServiceAccount", "Role", "ClusterRole", "RoleBinding", "ClusterRoleBinding"].includes(kindId)) return ["overview", "yaml", "related", "rbac"];
  if (kindId === "Node") return ["overview", "yaml", "related", "events"];
  return ["overview", "yaml", "related", "events"];
};

// 섹션 래퍼 — 접기 가능한 리소스 상세 드로어 구조
function Sec({ title, icon: I, right, children, defaultOpen = true }: { title: string; icon?: typeof Rocket; right?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ borderBottom: `1px solid ${UI.line2}`, padding: "14px 0" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", border: "none", background: "transparent", cursor: "pointer", padding: 0, marginBottom: open ? 10 : 0 }}>
        <ChevronDown size={12} style={{ color: UI.ink3, transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
        {I && <I size={12} style={{ color: UI.ink3 }} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: UI.ink }}>{title}</span>
        <span style={{ marginLeft: "auto" }}>{right}</span>
      </button>
      {open && children}
    </section>
  );
}
const Chip = ({ text, tone = "gray" }: { text: string; tone?: "gray" | "green" | "blue" | "purple" | "amber" | "lime" }) => {
  const S = { gray: ["#5F6570", "#F4F5F7"], green: ["#1F9D4D", "#EDFAF1"], blue: ["#0A6CFF", "#EDF4FF"], purple: ["#8250DF", "#F6F1FE"], amber: ["#B25A00", "#FFF6EA"], lime: ["#4D7C0F", "#F3FAE7"] }[tone];
  return <span style={{ display: "inline-block", fontSize: 11.5, fontFamily: MONO, color: S[0], background: S[1], borderRadius: 5, padding: "2px 7px", margin: "0 4px 4px 0", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>;
};

function KV({ k, v, mono, tone }: { k: string; v: string; mono?: boolean; tone?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "132px 1fr", gap: 12, padding: "7px 0", borderBottom: `1px solid ${UI.line2}` }}>
      <span style={{ fontSize: 12, color: UI.ink3 }}>{k}</span>
      <span style={{ fontSize: 12.5, color: tone ?? UI.ink, fontFamily: mono ? MONO : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
}

const TOPBAR_H = 57; // 상단 크롬 높이 — 오버레이는 이 아래부터 시작한다

// ── 메트릭 차트 — 그리드·축·호버 크로스헤어·현재점 펄스를 갖춘 고급 뷰 ──
function MetricChart({ name, bad }: { name: string; bad: boolean }) {
  const METS = [
    { id: "cpu", label: "CPU", unit: "m", base: 46, amp: 20 },
    { id: "mem", label: "Memory", unit: "MiB", base: 132, amp: 38 },
    { id: "rx", label: "Net RX", unit: "KB/s", base: 84, amp: 48 },
    { id: "tx", label: "Net TX", unit: "KB/s", base: 41, amp: 26 },
    { id: "io", label: "Disk I/O", unit: "IOPS", base: 12, amp: 8 },
  ] as const;
  const [mi, setMi] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const m = METS[mi];
  const W = 520, H = 168, PT = 12, PB = 24, PL = 44, PR = 14;
  const seed = name.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + mi * 97;
  const pts = useMemo(() => Array.from({ length: 40 }, (_, i) => {
    const r = Math.sin(seed + i * 1.7) * 0.5 + Math.sin(seed * 2 + i * 0.6) * 0.35 + Math.sin(i * 0.23 + seed) * 0.15;
    let v = m.base + r * m.amp;
    if (bad && m.id !== "io" && i > 28) v += (i - 28) * m.amp * 0.16; // 임계 리소스: 최근 급증 표현
    return Math.max(1, v);
  }), [seed, m, bad]);
  const top = Math.max(...pts) * 1.12;
  const X = (i: number) => PL + (i / (pts.length - 1)) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - v / top) * (H - PT - PB);
  let d = `M ${X(0)} ${Y(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${X(i) + (X(i + 1) - X(i)) / 3} ${Y(p1 + (p2 - p0) / 6)}, ${X(i + 1) - (X(i + 1) - X(i)) / 3} ${Y(p2 - (p3 - p1) / 6)}, ${X(i + 1)} ${Y(p2)}`;
  }
  const tone = bad ? HP.crit : BLUE;
  const fmt = (v: number) => `${Math.round(v)}${m.unit}`;
  const cur = pts[pts.length - 1], avg = pts.reduce((s, v) => s + v, 0) / pts.length, mx = Math.max(...pts);
  const hi = hover !== null ? Math.round(((hover - PL) / (W - PL - PR)) * (pts.length - 1)) : null;
  const hIdx = hi !== null ? Math.max(0, Math.min(pts.length - 1, hi)) : null;
  return (
    <div>
      {/* 지표 선택 */}
      <div style={{ display: "flex", gap: 3, background: "rgba(17,19,24,0.05)", borderRadius: 9, padding: 3, marginBottom: 12 }}>
        {METS.map((mm, i) => (
          <button key={mm.id} onClick={() => { setMi(i); setHover(null); }}
            style={{ flex: 1, textAlign: "center", fontSize: 11.5, fontWeight: 600, border: "none", cursor: "pointer", color: i === mi ? UI.ink : UI.ink3,
              background: i === mi ? "#fff" : "transparent", borderRadius: 7, padding: "5px 0", boxShadow: i === mi ? "0 1px 3px rgba(17,19,24,0.1)" : "none" }}>{mm.label}</button>
        ))}
      </div>
      {/* 통계 행 */}
      <div style={{ display: "flex", gap: 18, fontSize: 11.5, fontFamily: MONO, color: UI.ink3, marginBottom: 8, fontVariantNumeric: "tabular-nums" }}>
        <span>현재 <b style={{ color: tone, fontSize: 14 }}>{fmt(hIdx !== null ? pts[hIdx] : cur)}</b></span>
        <span>평균 <b style={{ color: UI.ink }}>{fmt(avg)}</b></span>
        <span>최대 <b style={{ color: UI.ink }}>{fmt(mx)}</b></span>
        {hIdx !== null && <span style={{ marginLeft: "auto", color: UI.ink3 }}>{Math.round((1 - hIdx / (pts.length - 1)) * 30)}분 전</span>}
      </div>
      <div style={{ border: `1px solid ${UI.line2}`, borderRadius: 12, background: "#FBFBFD", padding: "6px 4px 2px" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", cursor: "crosshair" }}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(((e.clientX - r.left) / r.width) * W); }}
          onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={`mg-${m.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity="0.22" />
              <stop offset="100%" stopColor={tone} stopOpacity="0.015" />
            </linearGradient>
          </defs>
          {/* 그리드 + Y 라벨 */}
          {[0.25, 0.5, 0.75].map((f) => (
            <g key={f}>
              <line x1={PL} x2={W - PR} y1={PT + f * (H - PT - PB)} y2={PT + f * (H - PT - PB)} stroke={UI.line2} strokeDasharray="3 5" />
              <text x={PL - 7} y={PT + f * (H - PT - PB) + 3.5} textAnchor="end" fontSize="9.5" fill={UI.ink3} fontFamily={MONO}>{fmt(top * (1 - f))}</text>
            </g>
          ))}
          {/* X 라벨 */}
          {["30분 전", "20분", "10분", "지금"].map((l, i) => (
            <text key={l} x={PL + (i / 3) * (W - PL - PR)} y={H - 7} textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"} fontSize="9.5" fill={UI.ink3}>{l}</text>
          ))}
          {/* 면 + 선 — 지표 전환 시 왼→오 드로잉 (EASE_DRAW) */}
          <motion.path key={`a-${m.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, ease: "easeOut", delay: 0.25 }}
            d={`${d} L ${X(pts.length - 1)} ${H - PB} L ${X(0)} ${H - PB} Z`} fill={`url(#mg-${m.id})`} />
          <motion.path key={`l-${m.id}`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.85, ease: [...EASE_DRAW] }}
            d={d} fill="none" stroke={tone} strokeWidth={1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {/* 현재점 펄스 */}
          <circle cx={X(pts.length - 1)} cy={Y(cur)} r={6} fill={tone} opacity={0.18}>
            <animate attributeName="r" values="4;9;4" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle cx={X(pts.length - 1)} cy={Y(cur)} r={3} fill={tone} stroke="#fff" strokeWidth={1.4} />
          {/* 호버 크로스헤어 */}
          {hIdx !== null && (
            <g>
              <line x1={X(hIdx)} x2={X(hIdx)} y1={PT} y2={H - PB} stroke={UI.ink3} strokeWidth={0.8} strokeDasharray="2 3" />
              <circle cx={X(hIdx)} cy={Y(pts[hIdx])} r={3.5} fill="#fff" stroke={tone} strokeWidth={2} />
              <g transform={`translate(${Math.min(W - PR - 62, Math.max(PL, X(hIdx) - 28))}, ${Math.max(2, Y(pts[hIdx]) - 26)})`}>
                <rect width="56" height="18" rx="6" fill={UI.ink} opacity="0.92" />
                <text x="28" y="12.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily={MONO}>{fmt(pts[hIdx])}</text>
              </g>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

// YAML 구문 하이라이트 — 코드 에디터 톤 (키·문자열·숫자·불리언·주석)
function hlYaml(src: string): string {
  return src.split("\n").map((line) => {
    const esc = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (/^\s*#/.test(esc)) return `<span class="y-c">${esc}</span>`;
    const m = esc.match(/^(\s*(?:- )?)([^\s:][^:]*)(:)(.*)$/);
    if (!m) return esc;
    const [, ind, key, colon, rest] = m;
    let v = rest;
    if (/^\s*-?\d+(\.\d+)?\s*$/.test(rest)) v = `<span class="y-n">${rest}</span>`;
    else if (/^\s*(true|false|null|~)\s*$/.test(rest)) v = `<span class="y-b">${rest}</span>`;
    else if (/^\s*["'].*["']\s*$/.test(rest)) v = `<span class="y-s">${rest}</span>`;
    else if (rest.trim()) v = `<span class="y-s">${rest}</span>`;
    return `${ind}<span class="y-k">${key}</span><span class="y-p">${colon}</span>${v}`;
  }).join("\n");
}
const YAML_FONT = { fontSize: 12.5, lineHeight: 1.65, fontFamily: MONO, padding: 14, whiteSpace: "pre" as const, wordBreak: "normal" as const };

function DetailOverlay({ kind, row, onClose, onToast, onOpenRef, forceFull = false, rightInset = 0, leftInset = 0, topInset = TOPBAR_H }: { kind: Kind; row: Row; onClose: () => void; onToast?: (t: { title: string; sub: string; tone: "ok" | "crit" }) => void; onOpenRef?: (kindId: string, name: string) => void; forceFull?: boolean; rightInset?: number; leftInset?: number; topInset?: number }) {
  const tabs = TABS_FOR(kind.id);
  const [tab, setTab] = useState<DetailTab>(tabs[0]);
  const [fullSelf, setFull] = useState(false);   // 전체 화면 (원본 레퍼런스의 ⤢)
  const full = forceFull || fullSelf;            // AI 대화창이 열리면 자연스럽게 전체 화면으로
  const name = String(row.name ?? "");
  const ns = String(row.ns ?? "–");
  const bad = !!row.bad;
  // 워크로드 기준 이름: 맵/표가 소속 서비스를 알려주면 그것이 진실 — 이름 파싱은 보조 수단
  const base = String(row.svc ?? "") || name.split("-").slice(0, 3).join("-") || name;
  const nodeName = String(row.node ?? "ip-10-0-1-24");
  const hostIp = nodeName.replace(/^ip-/, "").replace(/-/g, ".");           // EKS 노드 이름 ↔ 호스트 IP 일치
  const podIp = `10.0.${1 + (name.length % 4)}.${20 + ((name.length * 13) % 200)}`; // VPC CNI — 파드도 VPC 대역
  const phase = String(row.status ?? (bad ? "CrashLoopBackOff" : "Running"));
  const qos = String(row.qos ?? "BestEffort");
  const isSts = row.ownerKind === "StatefulSet";
  // YAML 편집 — 실제 제품처럼 보기 ↔ 편집 전환, 저장 시 kubectl apply 흐름
  const [yamlEditing, setYamlEditing] = useState(false);
  const [yamlDraft, setYamlDraft] = useState<string | null>(null);
  const [yamlSaved, setYamlSaved] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState(false);      // 비교 — 마지막 적용본 vs 서버 원본
  // 드로어 폭 — 왼쪽 가장자리 드래그로 조절 (전체 화면일 땐 비활성)
  const [dw, setDw] = useState(560);
  const [dwDragging, setDwDragging] = useState(false);
  const onEdgeDown = (e: React.PointerEvent) => {
    if (full) return;
    e.preventDefault(); setDwDragging(true);
    const move = (ev: PointerEvent) => setDw(Math.min(window.innerWidth - leftInset - 60, Math.max(460, window.innerWidth - ev.clientX)));
    const up = () => { setDwDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const [restartedAt, setRestartedAt] = useState<string | null>(null); // 재시작 요청 흔적 → 이벤트로 남는다
  const doRestart = () => {
    const t = new Date(); const ts = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    setRestartedAt(ts);
    onToast?.({ title: `${name} 재시작 요청됨`, sub: "kubectl rollout restart — 파드가 순차 교체됩니다", tone: "ok" });
  };
  const doDiff = () => {
    if (yamlSaved && yamlSaved !== yaml) { setDiffMode(true); setTab("yaml"); }
    else onToast?.({ title: "변경 사항 없음", sub: "마지막 적용본이 서버 원본과 동일합니다", tone: "ok" });
  };
  // 관련 리소스 접두어 → 종류 매핑 (클릭 = 해당 리소스 상세로 이동)
  const REF_KIND: Record<string, string> = { "rs/": "ReplicaSet", "deploy/": "Deployment", "sts/": "StatefulSet", "svc/": "Service", "pod/": "Pod", "cm/": "ConfigMap", "networkpolicy/": "NetworkPolicy" };
  const isWorkload = ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"].includes(kind.id);
  const isPod = kind.id === "Pod";
  const wp = isWorkload || isPod;                 // 워크로드·파드 전용 섹션
  const comp = base.split("-").slice(-1)[0] || base;
  const yaml = `apiVersion: ${kind.id === "Deployment" || kind.id === "DaemonSet" || kind.id === "StatefulSet" || kind.id === "ReplicaSet" ? "apps/v1" : kind.id === "Job" || kind.id === "CronJob" ? "batch/v1" : "v1"}
kind: ${kind.id === "HPA" ? "HorizontalPodAutoscaler" : kind.id === "PVC" ? "PersistentVolumeClaim" : kind.id}
metadata:
  name: ${name}
  namespace: ${ns}
  labels:
    app.kubernetes.io/name: ${name.split("-")[0]}
    app.kubernetes.io/managed-by: Helm
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${name.split("-")[0]}
status:
  observedGeneration: 3
  readyReplicas: ${bad ? 0 : 1}`;

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
        onClick={onClose} style={{ position: "fixed", top: topInset, right: 0, bottom: 0, left: leftInset, background: "rgba(17,19,24,0.07)", zIndex: 70 }} />
      <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 30, opacity: 0 }} transition={{ type: "spring", bounce: 0.06, visualDuration: 0.36 }}
        style={{ position: "fixed", top: topInset, right: 0, bottom: 0,
          /* 상단바·사이드바·서브사이드바는 덮지 않는다 — 콘텐츠 영역만 */
          width: full ? `calc(100vw - ${leftInset}px)` : dw, maxWidth: `calc(100vw - ${leftInset}px)`,
          background: UI.card, borderLeft: `1px solid ${UI.line}`, zIndex: 71, display: "flex", flexDirection: "column", boxShadow: "-24px 0 60px -30px rgba(17,19,24,0.3)", transition: dwDragging ? "none" : "width .28s cubic-bezier(.32,.72,0,1), padding-right .28s cubic-bezier(.32,.72,0,1)", paddingRight: full ? rightInset : 0, boxSizing: "border-box" }}>
        {/* 좌측 가장자리 리사이즈 핸들 */}
        {!full && (
          <div onPointerDown={onEdgeDown} title="드래그해서 폭 조절"
            style={{ position: "absolute", left: -2, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 5, background: dwDragging ? "rgba(10,132,255,0.35)" : "transparent", transition: "background .15s" }} />
        )}
        {/* 헤더 */}
        <div style={{ padding: "16px 20px 0", borderBottom: `1px solid ${UI.line}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(10,132,255,0.09)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <kind.icon size={15} style={{ color: BLUE }} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
              <div style={{ fontSize: 12, color: UI.ink3, marginTop: 2 }}>{kind.label} · {ns}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {([["비교", Copy, doDiff], ["재시작", Play, doRestart]] as const).map(([l, I, act]) => (
                <button key={l} onClick={act} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, color: UI.ink2, cursor: "pointer" }}>
                  <I size={11} />{l}
                </button>
              ))}
              <button title={forceFull ? "AI 대화 중에는 전체 화면 유지" : full ? "패널로 축소" : "전체 화면"} disabled={forceFull} onClick={() => setFull(!fullSelf)} style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: "rgba(17,19,24,0.06)", color: UI.ink3, cursor: forceFull ? "default" : "pointer", opacity: forceFull ? 0.4 : 1, fontSize: 12, lineHeight: 1 }}>{full ? "⤡" : "⤢"}</button>
              <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: "rgba(17,19,24,0.06)", color: UI.ink3, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, marginTop: 14 }}>
            {tabs.map((t) => {
              const on = tab === t;
              const label = DETAIL_TABS.find((d) => d.id === t)!.label;
              return (
                <button key={t} onClick={() => setTab(t)} style={{ position: "relative", border: "none", background: "transparent", cursor: "pointer", padding: "8px 12px 10px", fontSize: 13, fontWeight: on ? 700 : 500, color: on ? UI.ink : UI.ink3 }}>
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
                <Sec title="운영 이슈 (1)" icon={Activity}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, border: "1px solid #F5CFCC", background: "#FFF7F6", borderRadius: 10, padding: "10px 12px" }}>
                    <Badge text="critical" tone="red" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: UI.ink }}>{isPod ? phase : "워크로드 성능 저하"}</span>
                    <span style={{ fontSize: 12, color: UI.ink2 }}>{isPod ? `컨테이너가 반복 종료됨 · 재시작 ${String(row.restarts ?? 3)}회` : "인스턴스 1개 사용 불가"}</span>
                  </div>
                </Sec>
              )}

              {/* 상태 */}
              <Sec title="상태" icon={Activity}>
                {isWorkload
                  ? ([["목표 복제본", "2"], ["현재 복제본", "2"], ["준비됨", bad ? "1" : "2"], ["최신 상태", "2"], ["가용", bad ? "1" : "2"]] as const).map(([k, v]) => <KV key={k} k={k} v={v} mono />)
                  : ([["Phase", phase], ["노드", `${nodeName}.ap-northeast-2.compute.internal`], ["파드 IP", podIp], ["호스트 IP", hostIp], ["QoS 클래스", qos], ["ServiceAccount", `${base}-sa`]] as const).map(([k, v]) => <KV key={k} k={k} v={v} mono tone={k === "Phase" ? (bad ? "#C43028" : phase === "Pending" ? "#B25A00" : "#1F9D4D") : undefined} />)}
                <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
                  <button style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, color: BLUE, cursor: "pointer" }}><Boxes size={12} />관리 중인 파드 보기</button>
                  {isWorkload && <button style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, color: BLUE, cursor: "pointer" }}><MoveDiagonal size={12} />복제 수 조정</button>}
                </div>
              </Sec>

              {/* 전략 (워크로드) */}
              {isWorkload && (
                <Sec title="전략">
                  <KV k="업데이트 전략" v={kind.id === "Deployment" ? "Recreate" : "RollingUpdate"} />
                </Sec>
              )}

              {/* 파드 템플릿 / 컨테이너 (워크로드·파드) */}
              {wp && (
              <Sec title={isWorkload ? "파드 템플릿" : "컨테이너"} icon={Boxes}>
                <div style={{ border: `1px solid ${UI.line2}`, background: "#FBFBFD", borderRadius: 10, padding: "11px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: UI.ink }}>{comp}</span>
                    {isPod && <><Badge text="Ready" tone="green" /><Badge text="running" tone="gray" /></>}
                  </div>
                  <div style={{ fontSize: 11.5, color: UI.ink3, marginTop: 4, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(row.img ?? imgFor(base))}</div>
                  <div style={{ fontSize: 11.5, color: UI.ink3, marginTop: 3 }}>포트: metrics 9100/TCP · webhook 7000/TCP</div>
                </div>
              </Sec>
              )}

              {/* 환경 변수 (파드 전용) */}
              {isPod && (
                <Sec title="환경 변수 (12)" defaultOpen={false}>
                  <div style={{ fontSize: 11.5, fontFamily: MONO, lineHeight: 1.9, color: UI.ink2 }}>
                    {["NAMESPACE = field:metadata.namespace", "LOG_LEVEL = configmap:argocd-cmd-params-cm", "LOG_FORMAT = configmap:argocd-cmd-params-cm", "REPO_SERVER = configmap:argocd-cmd-params-cm", "K8S_CLIENT_QPS = configmap:argocd-cmd-params-cm"].map((e) => {
                      const [k, v] = e.split(" = ");
                      return <div key={k} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k} = <span style={{ color: BLUE, background: "#EDF4FF", borderRadius: 4, padding: "1px 5px" }}>{v}</span></div>;
                    })}
                  </div>
                </Sec>
              )}

              {/* 컨디션 (워크로드·파드) */}
              {wp && (
              <Sec title="컨디션 (2)">
                {(isWorkload ? [["Available", "MinimumReplicasAvailable", "1d 2h"], ["Progressing", "NewReplicaSetAvailable", "4d 2h"]] : [["Ready", "컨테이너 준비 완료", "1d 2h"], ["PodScheduled", "노드에 배정됨", "1d 2h"]]).map(([n, d, t]) => (
                  <div key={n} style={{ display: "grid", gridTemplateColumns: "56px 16px 1fr", gap: 9, alignItems: "start", padding: "7px 0" }}>
                    <span style={{ fontSize: 11, fontFamily: MONO, color: UI.ink3 }}>{t}</span>
                    <span style={{ color: HP.ok, fontSize: 13 }}>✓</span>
                    <span><span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: UI.ink }}>{n}</span><span style={{ display: "block", fontSize: 11.5, color: UI.ink3, marginTop: 1 }}>{d}</span></span>
                  </div>
                ))}
              </Sec>
              )}

              {/* 권한 (워크로드·파드) */}
              {wp && (
              <Sec title={`ServiceAccount 권한: ${base}-sa`} icon={ShieldCheck}>
                <div style={{ fontSize: 11.5, color: UI.ink3, marginBottom: 9 }}>직접 바인딩 1 · 그룹 상속 4 · 고유 규칙 6</div>
                {[["create", ["selfsubjectaccessreviews", "selfsubjectrulesreviews"], "authorization.k8s.io"], ["create", ["selfsubjectreviews"], "authentication.k8s.io"], ["get, list", ["pods"], ""]].map(([v, res, grp], i) => (
                  <div key={i} style={{ marginBottom: 7 }}>
                    <Chip text={v as string} tone="amber" />
                    <span style={{ fontSize: 11.5, color: UI.ink3, margin: "0 5px" }}>on</span>
                    {(res as string[]).map((rr) => <Chip key={rr} text={rr} tone="purple" />)}
                    {grp ? <><span style={{ fontSize: 11.5, color: UI.ink3, margin: "0 5px" }}>in</span><Chip text={grp as string} tone="gray" /></> : null}
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: UI.ink3, marginTop: 4 }}>규칙 1개 더 있음 · 전체 목록은 ServiceAccount에서 확인</div>
                <button style={{ border: "none", background: "transparent", color: BLUE, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "8px 0 0" }}>전체 권한 보기 →</button>
              </Sec>
              )}

              {/* 앱 정보 (워크로드·파드) */}
              {wp && (
              <Sec title="앱 정보" icon={Folder}>
                <KV k="앱 이름" v={base} mono /><KV k="컴포넌트" v={comp} mono /><KV k="네임스페이스" v={ns} mono />
              </Sec>
              )}

              {/* 메트릭 (워크로드·파드) */}
              {wp && (
              <Sec title="메트릭" icon={Activity}>
                <MetricChart name={name} bad={bad} />
              </Sec>
              )}

              {/* 데이터 (ConfigMap·Secret) */}
              {(kind.id === "ConfigMap" || kind.id === "Secret") && (
                <Sec title="데이터" icon={FileCog}>
                  {(kind.id === "Secret" ? [["username", "••••••••"], ["password", "••••••••"]] : [["feature.flags", "checkout=on, search=on"], ["api.base", "https://api.internal"]]).map(([k, v]) => (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, padding: "7px 0", borderBottom: `1px solid ${UI.line2}` }}>
                      <span style={{ fontSize: 12, fontFamily: MONO, color: BLUE }}>{k}</span>
                      <span style={{ fontSize: 12, fontFamily: MONO, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
                    </div>
                  ))}
                </Sec>
              )}

              {/* 관련 리소스 */}
              <Sec title="관련 리소스" icon={Copy}>
                {[
                  // StatefulSet 파드의 소유자는 sts 직접, Deployment 계열은 rs → deploy 체인
                  ...(isSts ? [["소유자", "sts/", base, "green"]] : [["소유자", "rs/", `${base}-69bddf5587`, "green"], ["디플로이먼트", "deploy/", base, "green"]]),
                  ["서비스", "svc/", base, "blue"],
                  ["파드", "pod/", `${base}-7494d5f69f-8kp4w`, "lime"],
                  // 연결된 구성: 인벤토리가 알려주면 그것을, 아니면 관례 이름
                  ...((Array.isArray(row.cfgs) && row.cfgs.length ? row.cfgs : ["argocd-cmd-params-cm"]).map((c) => ["구성", "cm/", String(c), "amber"])),
                  ["네트워크 정책", "networkpolicy/", `${base}-network-policy`, "purple"]]
                  .map(([label, pfx, n, tone]) => (
                    <div key={`${label}-${n}`} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: UI.ink3, marginBottom: 4 }}>{label as string}</div>
                      {/* 클릭 = 해당 리소스 상세로 이동 */}
                      <span onClick={REF_KIND[pfx as string] && onOpenRef ? () => onOpenRef(REF_KIND[pfx as string], String(n)) : undefined}
                        style={{ cursor: REF_KIND[pfx as string] && onOpenRef ? "pointer" : "default" }}>
                        <Chip text={`${pfx as string} ${n as string}`} tone={tone as "green"} />
                      </span>
                    </div>
                  ))}
              </Sec>

              {/* 최근 이벤트 */}
              <Sec title="최근 이벤트 (85)" icon={Activity}>
                {[...(restartedAt ? [["RestartTriggered", `수동 재시작 — kubectl rollout restart (${restartedAt})`]] : []),
                  ["SuccessfulCreate", `파드 생성: ${base}-5j5td`], ["SuccessfulDelete", `파드 삭제: ${base}-87g9q`], ["SuccessfulCreate", `파드 생성: ${base}-vzbd9`],
                  ...(bad ? [["BackOff", `실패한 컨테이너 재시작 대기 중 · 누적 ${String(row.restarts ?? 3)}회`]] : [])]
                  .map(([r, m], i) => (
                    <div key={i} style={{ borderLeft: `2px solid ${r === "BackOff" ? HP.crit : BLUE}`, background: r === "BackOff" ? "#FFF7F6" : "#F7FAFF", borderRadius: "0 8px 8px 0", padding: "9px 12px", marginBottom: 7 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: r === "BackOff" ? "#C43028" : UI.ink }}>{r as string}</span>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: UI.ink3, fontFamily: MONO }}>2026. 7. 17.</span>
                      </div>
                      <div style={{ fontSize: 12, color: UI.ink2, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m as string}</div>
                    </div>
                  ))}
                <button style={{ border: "none", background: "transparent", color: UI.ink3, fontSize: 12, cursor: "pointer", padding: "4px 0 0" }}>이벤트 50건 더 보기</button>
              </Sec>

              {/* 레이블 / 어노테이션 / 메타데이터 */}
              <Sec title="레이블 (3)">
                {[`app.kubernetes.io/component=${comp}`, `app.kubernetes.io/name=${base}`, `app.kubernetes.io/part-of=${ns}`].map((l) => <Chip key={l} text={l} />)}
              </Sec>
              <Sec title="어노테이션 (1)" defaultOpen={false}>
                <div style={{ fontSize: 12, fontFamily: MONO, color: UI.ink2 }}>deployment.kubernetes.io/revision: 1</div>
              </Sec>
              <Sec title="메타데이터">
                <KV k="UID" v="16057e00-404f-460b-afa4-13bb495f3c14" mono />
                <KV k="Resource Version" v="3476048" mono />
                <KV k="Generation" v="1" mono />
                <KV k="생성 시점" v={`${String(row.age ?? "4d")} 전`} mono />
              </Sec>

              {/* 감사 결과 (워크로드·파드) */}
              {wp && (
              <Sec title="점검 결과" icon={ShieldCheck} right={<span style={{ display: "flex", gap: 8, fontSize: 11.5, fontWeight: 700 }}>{bad && <span style={{ color: "#C43028" }}>1 critical</span>}<span style={{ color: "#B25A00" }}>7 warning</span></span>}>
                {[["ServiceAccount 토큰이 자동 마운트됨", "Security"], ["컨테이너에 readiness probe 없음", "Reliability"], ["컨테이너에 liveness probe 없음", "Reliability"],
                  ["컨테이너에 CPU request 없음", "Efficiency"], ["컨테이너에 memory request 없음", "Efficiency"], ["컨테이너에 CPU limit 없음", "Efficiency"], ["복제본이 1개뿐임", "Reliability"]]
                  .map(([t, cat]) => (
                    <div key={t as string} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: `1px solid ${UI.line2}` }}>
                      <span style={{ color: "#B25A00", fontSize: 13 }}>⚠</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t as string}</span>
                      <Badge text={cat as string} tone={cat === "Security" ? "purple" : cat === "Reliability" ? "blue" : "green"} />
                    </div>
                  ))}
                <button style={{ border: "none", background: "transparent", color: BLUE, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "9px 0 0" }}>전체 결과 보기 →</button>
              </Sec>
              )}
            </div>
          )}

          {tab === "yaml" && (() => {
            const saved = yamlSaved ?? yaml;
            const draft = yamlDraft ?? saved;
            const dirty = draft !== saved;
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                  <span style={{ fontSize: 11.5, fontFamily: MONO, color: UI.ink3 }}>{name}.yaml</span>
                  {yamlEditing && dirty && <Badge text="수정됨" tone="blue" />}
                  {diffMode && <Badge text="비교 — 서버 원본 대비" tone="purple" />}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    {diffMode ? (
                      <button onClick={() => setDiffMode(false)}
                        style={{ border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 600, color: UI.ink2, cursor: "pointer" }}>비교 닫기</button>
                    ) : !yamlEditing ? (
                      <button onClick={() => { setYamlDraft(saved); setYamlEditing(true); }}
                        style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 600, color: UI.ink2, cursor: "pointer" }}>
                        <Pencil size={11} />편집
                      </button>
                    ) : (
                      <>
                        <button onClick={() => { setYamlDraft(null); setYamlEditing(false); }}
                          style={{ border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 600, color: UI.ink2, cursor: "pointer" }}>취소</button>
                        <button disabled={!dirty}
                          onClick={() => { setYamlSaved(draft); setYamlDraft(null); setYamlEditing(false); onToast?.({ title: `${name} 적용 완료`, sub: "kubectl apply — 변경 사항이 클러스터에 반영되었습니다", tone: "ok" }); }}
                          style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: dirty ? BLUE : "rgba(17,19,24,0.12)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: dirty ? "pointer" : "default" }}>
                          <Check size={11} strokeWidth={3} />적용
                        </button>
                      </>
                    )}
                  </span>
                </div>
                {diffMode && yamlSaved ? (
                  /* 라인 diff — 제거는 빨강, 추가는 초록 (서버 원본 → 적용본) */
                  <pre style={{ ...YAML_FONT, margin: 0, color: UI.ink2, background: "#FBFBFD", border: `1px solid ${UI.line2}`, borderRadius: 10, overflowX: "auto" }}
                    dangerouslySetInnerHTML={{ __html: (() => {
                      const A = yaml.split("\n"), B = (yamlSaved ?? "").split("\n"); const out: string[] = [];
                      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                      for (let i = 0; i < Math.max(A.length, B.length); i++) {
                        const x = A[i], y = B[i];
                        if (x === y && x !== undefined) out.push("  " + hlYaml(x));
                        else { if (x !== undefined) out.push(`<span class="y-del">- ${esc(x)}</span>`); if (y !== undefined) out.push(`<span class="y-add">+ ${esc(y)}</span>`); }
                      }
                      return out.join("\n");
                    })() }} />
                ) : yamlEditing ? (
                  /* 하이라이트 레이어 위에 투명 텍스트 textarea — 편집 중에도 코드 에디터 색상 유지 */
                  <div style={{ position: "relative", background: "#fff", border: "1px solid rgba(10,132,255,0.4)", boxShadow: "0 0 0 3px rgba(10,132,255,0.1)", borderRadius: 10, overflow: "auto" }}>
                    <pre aria-hidden style={{ ...YAML_FONT, margin: 0, minHeight: 340, color: UI.ink, pointerEvents: "none" }}
                      dangerouslySetInnerHTML={{ __html: hlYaml(draft) + "\n" }} />
                    <textarea value={draft} onChange={(e) => setYamlDraft(e.currentTarget.value)} spellCheck={false} wrap="off"
                      style={{ ...YAML_FONT, position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, resize: "none", overflow: "hidden",
                        color: "transparent", caretColor: UI.ink, background: "transparent", border: "none", outline: "none", boxSizing: "border-box" }} />
                  </div>
                ) : (
                  <pre style={{ ...YAML_FONT, margin: 0, color: UI.ink2, background: "#FBFBFD", border: `1px solid ${UI.line2}`, borderRadius: 10, overflowX: "auto" }}
                    dangerouslySetInnerHTML={{ __html: hlYaml(saved) }} />
                )}
              </div>
            );
          })()}

          {tab === "related" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[["Service", base, Plug], ["ConfigMap", Array.isArray(row.cfgs) && row.cfgs.length ? String(row.cfgs[0]) : "app-config", FileCog], ["Secret", "db-credentials", KeyRound], ["Node", nodeName, Cpu], ["ReplicaSet", `${base}-7f9c4`, Copy]]
                .map(([k, n, I]) => (
                  <button key={n as string} className="rrow" onClick={onOpenRef ? () => onOpenRef(k as string, String(n)) : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: `1px solid ${UI.line2}`, background: "#FBFBFD", borderRadius: 10, padding: "9px 12px", cursor: "pointer" }}>
                    <I size={13} style={{ color: UI.ink3 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, fontFamily: MONO, color: UI.ink }}>{n as string}</span>
                      <span style={{ display: "block", fontSize: 11, color: UI.ink3, marginTop: 1 }}>{k as string}</span>
                    </span>
                    <ChevronDown size={12} style={{ color: "#C6CAD1", transform: "rotate(-90deg)" }} />
                  </button>
                ))}
            </div>
          )}

          {tab === "events" && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[...(restartedAt ? [["Normal", "RestartTriggered", `Manual rollout restart requested (${restartedAt})`, "방금"]] : []),
                ["Normal", "Scheduled", `Successfully assigned to ${nodeName}`, "2m"],
                ["Normal", "Pulled", `Container image "${imgFor(base)}" already present`, "2m"],
                ["Normal", "Created", `Created container: ${comp}`, "2m"],
                ["Normal", "Started", `Started container ${comp}`, "2m"],
                ...(bad ? [["Warning", "BackOff", `Back-off restarting failed container (x${String(row.restarts ?? 3)})`, "40s"]] : [])]
                .map(([t, r, m, a], i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "72px 110px 1fr 44px", gap: 10, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${UI.line2}` }}>
                    <Badge text={t as string} tone={t === "Warning" ? "red" : "green"} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: UI.ink }}>{r as string}</span>
                    <span style={{ fontSize: 12, color: UI.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{m as string}</span>
                    <span style={{ fontSize: 11.5, fontFamily: MONO, color: UI.ink3, textAlign: "right" }}>{a as string}</span>
                  </div>
                ))}
            </div>
          )}

          {tab === "logs" && (
            <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.7, fontFamily: MONO, background: "#0F1219", color: "#D6DBE5", borderRadius: 10, padding: 14, overflowX: "auto" }}>
{`2026-07-18T15:02:11Z INFO  server listening on :8080
2026-07-18T15:02:11Z INFO  connected to redis://redis:6379
2026-07-18T15:03:40Z INFO  GET /v1/items 200 12ms
2026-07-18T15:04:02Z WARN  slow query 1.9s (threshold 1s)
${bad ? `2026-07-18T15:04:31Z ERROR runtime: out of memory
2026-07-18T15:04:31Z FATAL container killed (OOMKilled)` : "2026-07-18T15:04:31Z INFO  GET /healthz 200 1ms"}`}
            </pre>
          )}

          {tab === "rbac" && (
            <div>
              <div style={{ fontSize: 12, color: UI.ink2, lineHeight: 1.6, marginBottom: 12 }}>
                이 리소스가 사용하는 ServiceAccount가 가진 권한입니다. 이 워크로드가 만드는 모든 파드가 아래 권한을 상속합니다.
              </div>
              <KV k="ServiceAccount" v={`${name.split("-")[0]}-sa`} mono />
              <KV k="바인딩" v="RoleBinding/app-reader · ClusterRoleBinding/metrics-view" mono />
              <div style={{ marginTop: 16, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", color: UI.ink3, marginBottom: 8 }}>유효 권한</div>
              {[["get, list, watch", "pods, services, configmaps"], ["create, patch", "events"], ["get", "secrets (app-config만)"]].map(([verbs, res]) => (
                <div key={verbs} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, padding: "7px 0", borderBottom: `1px solid ${UI.line2}` }}>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: BLUE }}>{verbs}</span>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: UI.ink2 }}>{res}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </motion.aside>
    </>
  );
}

// ── 종류 탐색 — 우측 패널 '리소스' 탭 내용 (보조 사이드바를 통합·대체) ─────────────────────────────
function KindIndex({ sel, onPick, showEmpty, setShowEmpty, pinned, togglePin, filter }: {
  sel: string; onPick: (k: Kind) => void; showEmpty: boolean; setShowEmpty: (v: boolean) => void;
  pinned: string[]; togglePin: (id: string) => void; filter: string; // 상단 ⌘K 검색이 단일 소스 — 자체 검색창 없음
}) {
  const emptyCount = KINDS.filter((k) => k.count === 0).length;
  const match = (k: Kind) => (k.label + k.id).toLowerCase().includes(filter.toLowerCase());
  const Row = ({ k }: { k: Kind }) => {
    const on = sel === k.id;
    return (
      <button onClick={() => onPick(k)} className="krow"
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: on ? "rgba(10,132,255,0.09)" : "transparent", borderRadius: 8, padding: "6px 9px" }}>
        <k.icon size={13} style={{ color: on ? BLUE : UI.ink3, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: on ? 600 : 500, color: on ? BLUE : UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</span>
        <span role="button" title="즐겨찾기" onClick={(e) => { e.stopPropagation(); togglePin(k.id); }} className="kpin" style={{ display: "grid", placeItems: "center", opacity: pinned.includes(k.id) ? 1 : 0 }}>
          <Pin size={10} style={{ color: pinned.includes(k.id) ? BLUE : UI.ink3 }} />
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: MONO, color: k.count ? (on ? BLUE : UI.ink2) : UI.ink3, background: on ? "rgba(10,132,255,0.12)" : "rgba(17,19,24,0.05)", borderRadius: 5, padding: "1px 6px", minWidth: 22, textAlign: "center", flexShrink: 0 }}>{k.count}</span>
      </button>
    );
  };
  return (
    <nav style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      {pinned.length > 0 && (
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", color: UI.ink3, padding: "0 9px 5px" }}>즐겨찾기</div>
        {KINDS.filter((k) => pinned.includes(k.id)).map((k) => <Row key={k.id} k={k} />)}
      </div>
      )}
      {GROUPS.map((g) => {
        const list = KINDS.filter((k) => k.group === g && (showEmpty || k.count > 0) && match(k));
        if (!list.length) return null;
        return (
          <div key={g}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 9px 5px" }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", color: UI.ink3 }}>{g}</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontFamily: MONO, color: UI.ink3 }}>{GROUP_TOTAL(g)}</span>
            </div>
            {list.map((k) => <Row key={k.id} k={k} />)}
          </div>
        );
      })}
      <button onClick={() => setShowEmpty(!showEmpty)} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: UI.ink3, fontSize: 12, cursor: "pointer", padding: "9px", borderTop: `1px solid ${UI.line2}` }}>
        <Eye size={12} />{showEmpty ? "비어 있는 종류 숨기기" : `비어 있는 종류 ${emptyCount}개 표시`}
      </button>
    </nav>
  );
}

// ── 전역 내비게이션 레일 — 제품 셸의 바깥 틀 ─────────────────────────────
const NAV_ITEMS: { id: string; label: string; icon: typeof Home; href?: string }[] = [
  { id: "home", label: "홈", icon: Home, href: "/devpreview-index.html" },
  { id: "resources", label: "리소스", icon: ListTree },
  { id: "issues", label: "이슈", icon: AlertTriangle },
  { id: "topology", label: "토폴로지", icon: Share2 }, // 셸 내 서피스 전환
  { id: "apps", label: "애플리케이션", icon: Boxes },
  { id: "timeline", label: "타임라인", icon: Clock },
  { id: "traffic", label: "실시간 트래픽", icon: Activity },
  { id: "helm", label: "Helm", icon: Package },
  { id: "gitops", label: "GitOps", icon: GitBranch },
  { id: "checks", label: "점검", icon: ShieldCheck },
  { id: "cost", label: "비용", icon: Coins },
];
const NAV_BOTTOM: { id: string; label: string; icon: typeof Home; href?: string }[] = [
  { id: "settings", label: "연결 설정", icon: Settings }, // 셸 내 위저드 서피스 전환 (AI는 우하단 플로팅 버튼)
];

type Surface = "resources" | "connect" | "topology";
const SURFACE_OF: Record<string, Surface> = { resources: "resources", settings: "connect", topology: "topology" };

function GlobalNav({ collapsed, setCollapsed, surface, onSurface }: {
  collapsed: boolean; setCollapsed: (v: boolean) => void;
  surface: Surface; onSurface: (s: Surface) => void;
}) {
  const Item = ({ it }: { it: (typeof NAV_ITEMS)[number] }) => {
    const sid = SURFACE_OF[it.id];
    const active = !!sid && surface === sid;
    const enabled = active || !!it.href || !!sid;
    const body = (
      <span className={enabled ? "gnav" : undefined} title={collapsed ? it.label : undefined}
        onClick={sid ? () => onSurface(sid) : undefined}
        style={{ display: "flex", alignItems: "center", gap: 11, borderRadius: 9, padding: collapsed ? "9px 0" : "8px 11px", justifyContent: collapsed ? "center" : "flex-start",
          background: active ? "rgba(10,132,255,0.09)" : "transparent", color: active ? BLUE : enabled ? UI.ink2 : UI.ink3,
          opacity: enabled ? 1 : 0.45, cursor: enabled ? "pointer" : "default", transition: "background .14s" }}>
        <it.icon size={16} style={{ flexShrink: 0 }} />
        {!collapsed && <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500, whiteSpace: "nowrap" }}>{it.label}</span>}
      </span>
    );
    return it.href
      ? <a key={it.id} href={it.href} style={{ textDecoration: "none", display: "block" }}>{body}</a>
      : <div key={it.id}>{body}</div>;
  };
  return (
    <motion.nav initial={false} animate={{ width: collapsed ? 60 : 208 }} transition={SOFT}
      style={{ flexShrink: 0, background: UI.card, borderRight: `1px solid ${UI.line}`, display: "flex", flexDirection: "column",
        padding: "14px 10px 12px", position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>
      {/* 브랜드 — Opsia 워드마크 */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: collapsed ? "0 0 16px" : "0 4px 16px", justifyContent: collapsed ? "center" : "flex-start" }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg, ${BLUE}, #5AC8FA)`, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, border: "2px solid #fff" }} />
        </span>
        {!collapsed && <span style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: "-0.02em", color: UI.ink }}>Opsia</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>{NAV_ITEMS.map((it) => <Item key={it.id} it={it} />)}</div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 1, borderTop: `1px solid ${UI.line2}`, paddingTop: 8 }}>
        {NAV_BOTTOM.map((it) => <Item key={it.id} it={it} />)}
        <button onClick={() => setCollapsed(!collapsed)} className="gnav"
          style={{ display: "flex", alignItems: "center", gap: 11, border: "none", background: "transparent", borderRadius: 9, padding: collapsed ? "9px 0" : "8px 11px", justifyContent: collapsed ? "center" : "flex-start", color: UI.ink3, cursor: "pointer" }}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span style={{ fontSize: 13.5, fontWeight: 600 }}>접기</span>}
        </button>
      </div>
    </motion.nav>
  );
}

// ── 앱 ─────────────────────────────
// 종류 선택 → 맵 '연결 보기' 탭 매핑 (같은 축은 한 몸으로 움직인다)
const lensTabFor = (id: string): "svc" | "cfg" | "git" | null =>
  id === "Service" ? "svc"
  : id === "ConfigMap" || id === "Secret" ? "cfg"
  : ["Application", "ApplicationSet", "AppProject"].includes(id) ? "git"
  : null;

function App() {
  const [kindId, setKindId] = useState("Deployment");
  const [showEmpty, setShowEmpty] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const [q, setQ] = useState(""); // 단일 검색 — 종류 인덱스와 표 행을 동시에 필터
  const [ns, setNs] = useState("모든 네임스페이스");
  const [detail, setDetail] = useState<{ kind: Kind; row: Row } | null>(null);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiW, setAiW] = useState(440);                 // 실제 제품처럼 리사이즈 가능한 도킹 폭
  const [aiDragging, setAiDragging] = useState(false);
  const [surface, setSurface] = useState<Surface>("resources"); // 셸 내 서피스 전환 (리소스·토폴로지·연결 설정)
  const [dense, setDense] = useState(false); // 표 밀도 — 기본/촘촘
  const onAiHandleDown = (e: React.PointerEvent) => {
    e.preventDefault(); setAiDragging(true);
    const move = (ev: PointerEvent) => setAiW(Math.min(560, Math.max(380, window.innerWidth - ev.clientX)));
    const up = () => { setAiDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const [scope, setScope] = useState<{ level: string; cluster?: string; node?: string }>({ level: "clusters" });
  const scopeLabel = scope.level === "clusters" ? "전체 클러스터" : scope.level === "nodes" ? `클러스터 ${scope.cluster}` : `노드 ${scope.node}`;
  const kind = KINDS.find((k) => k.id === kindId)!;
  const togglePin = (id: string) => setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const searchRef = useRef<HTMLInputElement>(null);
  // 상단 크롬 높이 — 폰트·확대에 따라 변하므로 실측해서 오버레이 기준으로 쓴다
  const headerRef = useRef<HTMLElement>(null);
  const [topH, setTopH] = useState(TOPBAR_H);
  useEffect(() => {
    const el = headerRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setTopH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  // 반응형 — 좁은 화면(200% 확대 등)에서 내비를 자동으로 아이콘만 남긴다
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const on = () => { if (mq.matches) setNavCollapsed(true); };
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // 표 데이터: 맵 드릴 범위(클러스터 귀속)와 검색을 실제로 적용
  const allRows = useMemo(() => { const spec = SPEC[kindId]; return spec ? spec.rows(rng(kindId.length * 977 + 13)) : []; }, [kindId]);
  const inScope = scope.level !== "clusters" && !!scope.cluster;
  // 행에 실제 클러스터 귀속(cluster 필드)이 있으면 그것을 쓰고, 없으면 결정적 귀속으로 보완
  const scopedRows = useMemo(() => (inScope ? allRows.filter((r) => String(r.cluster ?? clusterOf(String(r.name ?? ""))) === scope.cluster) : allRows), [allRows, inScope, scope.cluster]);
  const shownRows = useMemo(() => (q ? scopedRows.filter((r) => String(r.name ?? "").toLowerCase().includes(q.toLowerCase())) : scopedRows), [scopedRows, q]);
  const openFromMap = (kid: string, data: Record<string, unknown>) => {
    const k = KINDS.find((x) => x.id === kid); if (k) setDetail({ kind: k, row: data });
  };

  // 알림 — 인벤토리 파생: 임계 파드(위험) + 예약 중 노드(정보) + OutOfSync 저장소(경고)
  const [bellOpen, setBellOpen] = useState(false);
  const alerts = useMemo(() => podInventory().filter((p) => p.bad), []);
  const nodeAlerts = useMemo(() => nodeInventory().filter((n) => n.state !== "Ready"), []);
  const repoAlerts = useMemo(() => repoInventory().filter((r) => r.sync === "OutOfSync"), []);
  const alertTotal = alerts.length + nodeAlerts.length + repoAlerts.length;
  const [toasts, setToasts] = useState<{ id: number; title: string; sub: string; tone: "ok" | "crit" }[]>([]);
  const toastSeq = useRef(0);
  const pushToast = (t: { title: string; sub: string; tone: "ok" | "crit" }) => {
    const id = ++toastSeq.current;
    setToasts((cur) => [...cur, { id, ...t }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 3800);
  };
  const openAlert = (p: (typeof alerts)[number]) => {
    setBellOpen(false);
    openFromMap("Pod", { ...p, age: `${3 + (p.cpu % 9)}d` });
  };
  // 관련 리소스 이동 — 같은 종류 표에 실데이터가 있으면 그 행으로 연다
  const openRef = (kid: string, name: string) => {
    const k = KINDS.find((x) => x.id === kid); if (!k) return;
    const rows = SPEC[kid] ? SPEC[kid].rows(rng(kid.length * 977 + 13)) : [];
    const found = rows.find((r) => String(r.name) === name || String(r.name).startsWith(name));
    setDetail({ kind: k, row: found ?? { name, ns: nsFor(name) } });
  };

  return (
    <div className="uni" style={{ minHeight: "100vh", background: UI.bg, display: "flex", alignItems: "stretch", zoom: PRESENT_SCALE }}>
      {/* 전역 내비게이션 — 제품 셸의 바깥 틀 */}
      <GlobalNav collapsed={navCollapsed} setCollapsed={setNavCollapsed}
        surface={surface} onSurface={setSurface} />

      <div style={{ flex: 1, minWidth: 0 }}>
      {/* 상단 크롬 — 클러스터·네임스페이스·검색·자동 갱신 */}
      <header ref={headerRef} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${UI.line}`, background: UI.card }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${UI.line}`, borderRadius: 9, padding: "6px 11px", fontSize: 13, fontWeight: 600, color: UI.ink }}>
          <Server size={13} style={{ color: UI.ink3 }} />prod-eks<ChevronDown size={12} style={{ color: UI.ink3 }} />
        </span>
        <button onClick={() => setNs(ns === "모든 네임스페이스" ? "argocd" : "모든 네임스페이스")}
          style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 9, padding: "6px 11px", fontSize: 13, fontWeight: 600, color: UI.ink, cursor: "pointer" }}>
          <Globe size={13} style={{ color: UI.ink3 }} />{ns}<ChevronDown size={12} style={{ color: UI.ink3 }} />
        </button>
        <span className="livedot" style={{ width: 7, height: 7, borderRadius: 999, background: HP.ok }} />
        <div style={{ flex: 1, maxWidth: 520, margin: "0 auto", display: "flex", alignItems: "center", gap: 8, border: `1px solid ${UI.line}`, background: "#FBFBFD", borderRadius: 9, padding: "6px 12px" }}>
          <Search size={13} style={{ color: UI.ink3 }} />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="리소스 검색 — 종류와 이름을 함께 찾습니다" style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: UI.ink, width: "100%" }} />
          <span style={{ fontSize: 11, fontFamily: MONO, color: UI.ink3, border: `1px solid ${UI.line}`, borderRadius: 4, padding: "1px 5px" }}>⌘K</span>
        </div>
        <span className="hide-narrow" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: UI.ink2 }}>
          <span className="livedot" style={{ width: 6, height: 6, borderRadius: 999, background: HP.ok }} />자동 갱신
        </span>
        {/* 알림 벨 — 배지 수는 맵의 장애 수와 같은 인벤토리에서 나온다 */}
        <span style={{ position: "relative" }}>
          <button className="gnav" onClick={() => setBellOpen(!bellOpen)}
            style={{ width: 30, height: 30, borderRadius: 999, border: "none", background: bellOpen ? "rgba(10,132,255,0.1)" : "rgba(17,19,24,0.045)", color: bellOpen ? BLUE : UI.ink2, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <Bell size={14} />
          </button>
          {alertTotal > 0 && (
            <span style={{ position: "absolute", top: -3, right: -3, minWidth: 15, height: 15, borderRadius: 999, background: alerts.length ? HP.crit : HP.warn, color: "#fff", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 4px", border: "2px solid #fff", boxSizing: "content-box" }}>{alertTotal}</span>
          )}
          <AnimatePresence>
            {/* 애플 알림 센터 스타일 — 반투명 블러 패널 위 카드 스택 */}
            {bellOpen && (
              <motion.div key="bell" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.98 }} transition={SOFT}
                style={{ position: "absolute", top: 38, right: 0, width: 344, zIndex: 65, background: "rgba(246,247,250,0.86)", backdropFilter: "blur(26px)", WebkitBackdropFilter: "blur(26px)",
                  border: "1px solid rgba(17,19,24,0.08)", borderRadius: 18, boxShadow: "0 28px 70px -24px rgba(17,19,24,0.38)", padding: 10, maxHeight: "min(70vh, 560px)", overflowY: "auto", scrollbarGutter: "stable" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "2px 8px 8px" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: UI.ink }}>알림</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: UI.ink3 }}>{alertTotal}</span>
                </div>
                {(() => {
                  const Card = ({ icon: I, tint, title, body, time, right, onClick }: { icon: typeof Bell; tint: string; title: string; body: string; time: string; right?: string; onClick?: () => void }) => (
                    <button className="acard" onClick={onClick} disabled={!onClick}
                      style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left", background: "rgba(255,255,255,0.85)",
                        border: "1px solid rgba(17,19,24,0.05)", borderRadius: 14, padding: "10px 12px", marginBottom: 6, cursor: onClick ? "pointer" : "default",
                        boxShadow: "0 1px 2px rgba(17,19,24,0.05)" }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: tint, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                        <I size={14} color="#fff" strokeWidth={2.2} />
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                          <span style={{ fontSize: 10.5, color: UI.ink3, flexShrink: 0 }}>{time}</span>
                        </span>
                        <span style={{ display: "block", fontSize: 11.5, color: UI.ink2, marginTop: 2, lineHeight: 1.45 }}>{body}</span>
                        {right && <span style={{ display: "block", fontSize: 10.5, fontFamily: MONO, color: UI.ink3, marginTop: 3 }}>{right}</span>}
                      </span>
                    </button>
                  );
                  return (
                    <>
                      {alerts.map((p) => (
                        <Card key={p.name} icon={Activity} tint={HP.crit} title={p.name} time={`${2 + (p.cpu % 9)}분 전`}
                          body={`${p.status} · 재시작 ${p.restarts}회 · ${p.node}`} right={p.cluster} onClick={() => openAlert(p)} />
                      ))}
                      {repoAlerts.map((r) => (
                        <Card key={r.repo} icon={GitBranch} tint={HP.warn} title={r.repo} time="12분 전"
                          body={`OutOfSync · ${r.tool} · 리비전 ${r.rev}`} right="GitOps" />
                      ))}
                      {nodeAlerts.map((n) => (
                        <Card key={n.id} icon={Server} tint={n.state === "Provisioning" ? BLUE : "#8E8E93"} title={n.id} time="34분 전"
                          body={`${n.state === "Provisioning" ? "예약됨 — 노드 준비 중" : "차단됨 — 스케줄링 제외"} · ${n.instance}`} right={n.cluster}
                          onClick={() => { setBellOpen(false); openRef("Node", n.id); }} />
                      ))}
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </span>
        {[CircleHelp, Moon].map((I, i) => (
          <button key={i} className="gnav hide-narrow" style={{ width: 30, height: 30, borderRadius: 999, border: "none", background: "rgba(17,19,24,0.045)", color: UI.ink2, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <I size={14} />
          </button>
        ))}
      </header>

      {surface === "connect" ? (
        /* 연결 설정 — 셸 안에서 위저드 서피스로 전환 (별도 페이지 아님) */
        <div style={{ position: "relative", minHeight: "calc(100vh - 57px)", background: UI.bg }}>
          <ConnectWizard embedded />
        </div>
      ) : surface === "topology" ? (
        /* 토폴로지 — 호출 그래프 서피스 (맵=물리 · 토폴로지=호출 분업 유지) */
        <div style={{ padding: "16px 18px 40px", background: UI.bg }}>
          {/* 더블클릭 = 셸 안에서 리소스 서피스로 복귀 + Service 종류 선택 (페이지 이탈 없음) */}
          <TopologyView embedded onOpenService={(id) => openRef("Service", id)} />
        </div>
      ) : (
        <main style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 18, padding: "16px 18px 40px" }}>
          {/* ── 드릴 맵 + 스코프 연동 표 — 종류 탐색은 우측 '탐색' 패널의 리소스 탭으로 통합.
                파드뷰에선 맵이 파드 표를 이미 보여주므로 숨김(중복 제거) ── */}
          <OpsiaMap embedded onScopeChange={setScope} onOpenResource={openFromMap} lensTab={lensTabFor(kindId)}
            kindsTab={<KindIndex sel={kindId} onPick={(k) => setKindId(k.id)} showEmpty={showEmpty} setShowEmpty={setShowEmpty} pinned={pinned} togglePin={togglePin} filter={q} />}
            belowContent={scope.level !== "pods" && (
              <div style={{ borderTop: `1px solid ${UI.line}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <kind.icon size={15} style={{ color: BLUE }} />
                  <span style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink }}>{kind.label}</span>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: UI.ink3 }}>{shownRows.length}{shownRows.length !== allRows.length ? ` / ${allRows.length}` : ""}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: inScope ? BLUE : UI.ink2, background: inScope ? "rgba(10,132,255,0.08)" : "rgba(17,19,24,0.045)", borderRadius: 999, padding: "3px 11px" }}>범위 · {scopeLabel}</span>
                  {/* 밀도 토글 — 많은 행을 한 화면에 */}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 2, background: "rgba(17,19,24,0.05)", borderRadius: 8, padding: 2 }}>
                    {([["기본", false], ["촘촘", true]] as const).map(([l, v]) => (
                      <button key={l} onClick={() => setDense(v)}
                        style={{ border: "none", borderRadius: 6, padding: "3px 9px", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                          background: dense === v ? "#fff" : "transparent", color: dense === v ? UI.ink : UI.ink3,
                          boxShadow: dense === v ? "0 1px 3px rgba(17,19,24,0.12)" : "none" }}>{l}</button>
                    ))}
                  </span>
                </div>
                {/* 표 교체는 대기 없이 즉시 — exit를 기다리면 전환이 느리고, 탭 스로틀 시 멈춘다 */}
                <motion.div key={kindId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
                  <ResourceTable kind={kind} rows={shownRows} q={q} inScope={inScope} dense={dense} onOpen={(r) => setDetail({ kind, row: r })} />
                </motion.div>
              </div>
            )} />
        </main>
      )}
      </div>

      {/* AI 어시스턴트 — 상세 페이지 위까지 덮는 우측 오버레이 + 폭 조절 핸들 */}
      <AnimatePresence>
        {aiOpen && (
          <motion.div key="ai" initial={{ x: aiW + 30 }} animate={{ x: 0 }} exit={{ x: aiW + 30 }} transition={{ type: "spring", bounce: 0.06, visualDuration: 0.34 }}
            style={{ position: "fixed", top: topH, right: 0, bottom: 0, width: aiW, zIndex: 72, display: "flex", boxShadow: "-28px 0 70px -32px rgba(17,19,24,0.3)" }}>
            <div onPointerDown={onAiHandleDown} title="드래그해서 폭 조절"
              style={{ width: 5, flexShrink: 0, cursor: "col-resize", background: aiDragging ? "rgba(10,132,255,0.35)" : "transparent", transition: "background .15s" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <AiPanel embedded onClose={() => setAiOpen(false)} contextView={surface === "connect" ? "연결 설정" : surface === "topology" ? "토폴로지" : "리소스"} contextScope={scope.cluster ?? "전체 클러스터"} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI 플로팅 버튼 — 항상 최상위(상세 위 포함) · AI 창이 열리면 사라진다 */}
      <AnimatePresence>
        {!aiOpen && (
          <motion.button key="fab" onClick={() => setAiOpen(true)} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.93 }}
            initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={SOFT}
            title="AI 어시스턴트"
            style={{ position: "fixed", right: 22, bottom: 22, zIndex: 75, width: 48, height: 48, borderRadius: 999, border: "none", cursor: "pointer",
              background: `linear-gradient(135deg, ${BLUE}, #5AC8FA)`, color: "#fff", display: "grid", placeItems: "center",
              boxShadow: "0 10px 26px -8px rgba(10,132,255,0.55), 0 2px 8px rgba(17,19,24,0.12)" }}>
            <Sparkles size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* 상세 — 최상위 레이어 오버레이 (Esc로 닫힘) */}
      <AnimatePresence>
        {detail && <DetailOverlay key={`${detail.kind.id}-${String(detail.row.name)}`} kind={detail.kind} row={detail.row} onClose={() => setDetail(null)} onToast={pushToast} onOpenRef={openRef} forceFull={aiOpen} rightInset={aiOpen ? aiW : 0} leftInset={navCollapsed ? 60 : 208} topInset={topH} />}
      </AnimatePresence>

      {/* 작업 토스트 — 우측 상단 스택 */}
      <div style={{ position: "fixed", top: 14, right: 16, zIndex: 80, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: -14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={SOFT}
              style={{ display: "flex", alignItems: "center", gap: 10, width: 340, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 13, padding: "11px 13px", boxShadow: "0 16px 44px -16px rgba(17,19,24,0.3)", pointerEvents: "auto" }}>
              <span style={{ width: 26, height: 26, borderRadius: 9, background: t.tone === "ok" ? HP.ok : HP.crit, display: "grid", placeItems: "center", flexShrink: 0 }}>
                {t.tone === "ok" ? <Check size={14} color="#fff" strokeWidth={3} /> : <AlertTriangle size={13} color="#fff" />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                <span style={{ display: "block", fontSize: 11.5, color: UI.ink2, marginTop: 1 }}>{t.sub}</span>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <style>{`
        .uni { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
        .uni .krow { transition: background .14s ease; }
        .uni .krow:hover { background: rgba(17,19,24,0.045); }
        .uni .krow:hover .kpin { opacity: .5 !important; }
        .uni .rrow { transition: background .12s ease; }
        .uni .rrow:hover { background: rgba(17,19,24,0.028); }
        .uni .gnav:hover { background: rgba(17,19,24,0.05) !important; }
        .uni .acard { transition: transform .12s ease, background .12s ease; }
        .uni .acard:not(:disabled):hover { background: #fff !important; transform: translateY(-1px); }
        /* YAML 구문 색상 — 라이트 코드 에디터 팔레트 (Badge 텍스트 톤과 동일 계열) */
        .uni .y-k { color: #0A6CFF; }
        .uni .y-s { color: #1F9D4D; }
        .uni .y-n { color: #B25A00; }
        .uni .y-b { color: #8250DF; }
        .uni .y-p { color: #9AA0AA; }
        .uni .y-c { color: #9AA0AA; font-style: italic; }
        .uni .y-del { color: #C43028; background: #FFF3F2; }
        .uni .y-add { color: #1F9D4D; background: #EDFAF1; }
        .uni .livedot { animation: lv 1.6s ease-in-out infinite; }
        @keyframes lv { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .uni ::-webkit-scrollbar { width: 8px; } .uni ::-webkit-scrollbar-thumb { background: rgba(17,19,24,0.12); border-radius: 99px; }
        @media (prefers-reduced-motion: reduce) { .uni .livedot { animation: none !important; } }
        /* 좁은 화면(200% 확대 등): 부가 요소를 접어 핵심만 남긴다 */
        @media (max-width: 980px) { .uni .hide-narrow { display: none !important; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
