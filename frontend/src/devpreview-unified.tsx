// ⚠ 데모 · 통합 리소스 — 리소스 종류 인덱스(전체 택소노미) + 종류별 표 + 물리/관계 관점.
// 병합 규칙: 좌측 = 무엇을(종류) · 상단 관점 = 어떻게(물리/관계/목록).
// 워크로드·노드 계열은 관점 전환이 가능하고, 나머지는 종류별 전용 표로 정보를 잃지 않게 표시.
import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Server, FileCog, Network, Globe, Search, KeyRound,
  Rocket, Database, Boxes, Copy, LayoutGrid, Play, Timer, Plug, DoorOpen, ShieldCheck, MoveDiagonal,
  HardDrive, Cpu, Folder, Activity, UserCog, Eye, Radio, ChevronDown, Pin,
} from "lucide-react";
import { OpsiaMap } from "./devpreview-opsia";
import "./styles/tokens.css";
import "./styles/foundation.css";

const UI = { bg: "#FAFAFC", card: "#FFFFFF", line: "#E9EAEE", line2: "#F1F2F5", ink: "#111318", ink2: "#5F6570", ink3: "#9AA0AA" } as const;
const BLUE = "#0A84FF";
const HP = { ok: "#30D158", warn: "#FFB340", crit: "#FF5F55", ghost: "#F3F4F6" } as const;
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";
const SOFT = { type: "spring", bounce: 0.12, visualDuration: 0.32 } as const;

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
  if (["auth", "gateway", "worker", "notifier", "media", "redis", "backend"].some((s) => n.startsWith(s))) return "platform";
  return "sandbox";
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
    rows: (r) => Array.from({ length: 26 }).map((_, i) => {
      const svc = pick(r, ["argocd-server", "argocd-redis", "aws-node", "backend", "caretta-grafana", "shop-api", "checkout", "payments", "search", "auth", "gateway", "coredns"]);
      const bad = r() < 0.08;
      const nm = `${svc}-${Math.floor(r() * 9000) + 1000}${["-vhk2w", "-cghhs", "-j6lzb", "-k4kw5", "-xtksb"][i % 5]}`;
      return { name: nm, ns: nsFor(svc), img: imgFor(svc),
        ctr: 1 + Math.floor(r() * 3), status: bad ? "CrashLoopBackOff" : "Running",
        cpu: { used: `${Math.floor(r() * 9)}m`, lim: "50m", pct: Math.floor(r() * 60) + 5 }, mem: { used: `${Math.floor(r() * 90) + 5}Mi`, lim: "300Mi", pct: Math.floor(r() * 70) + 5 }, age: age(r), bad };
    }),
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
    rows: () => [],
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
    rows: () => [],
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
    rows: () => [],
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
    rows: () => [],
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
    rows: (r) => [["ip-192-168-26-122.ap-northeast-2.compute.internal"], ["ip-192-168-81-49.ap-northeast-2.compute.internal"]].map(([name]) => ({ name, age: age(r) })) },
  APIService: { cols: [{ k: "name", label: "NAME", w: "minmax(240px,2.4fr)", cell: { t: "text" } }, { k: "svc", label: "SERVICE", w: "minmax(140px,1fr)", cell: { t: "mono" } }, { k: "avail", label: "AVAILABLE", w: "96px", cell: { t: "badge", tone: "green" } }, { k: "age", label: "AGE", w: "56px", cell: { t: "text" } }],
    rows: (r) => ["v1.", "v1.apps", "v1.batch", "v1beta1.metrics.k8s.io", "v1.argoproj.io", "v1alpha1.argoproj.io"].map((name) => ({ name, svc: name.includes("metrics") ? "kube-system/metrics-server" : "Local", avail: "True", age: age(r) })) },
  Node: {
    cols: [{ k: "name", label: "NAME", w: "minmax(200px,1.6fr)", cell: { t: "text" } }, { k: "st", label: "STATUS", w: "88px", cell: { t: "badge", tone: "green" } },
      { k: "roles", label: "ROLES", w: "88px", cell: { t: "text" } }, { k: "cpu", label: "CPU", w: "150px", cell: { t: "meter" } },
      { k: "mem", label: "MEMORY", w: "150px", cell: { t: "meter" } }, { k: "pods", label: "PODS", w: "140px", cell: { t: "meter" } }, { k: "cond", label: "CONDITIONS", w: "100px", cell: { t: "text" } }],
    rows: () => [
      { name: "ip-192-168-26-122.ap-…", st: "Ready", roles: "worker", cpu: { used: "381m", lim: "1930m", pct: 20 }, mem: { used: "4.5Gi", lim: "6.9Gi", pct: 64 }, pods: { used: "27", lim: "29", pct: 93 }, cond: "Healthy" },
      { name: "ip-192-168-81-49.ap-n…", st: "Ready", roles: "worker", cpu: { used: "295m", lim: "1930m", pct: 15 }, mem: { used: "2.1Gi", lim: "6.9Gi", pct: 31 }, pods: { used: "21", lim: "29", pct: 72 }, cond: "Healthy" },
    ],
  },
};

// ── 종류 인덱스 (레퍼런스 구조 그대로) ─────────────────────────────
type KindView = "physical" | "relation" | "table";
type Kind = { id: string; label: string; icon: typeof Rocket; group: string; view: KindView; count: number };
// 그룹·종류·개수는 실제 기준 인스턴스(cluster-1)에서 확인한 값 그대로
const GROUPS = ["워크로드", "네트워킹", "구성", "스토리지", "접근 제어", "클러스터", "ARGO", "AWS VPC CNI", "API 등록"] as const;
const KINDS: Kind[] = [
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
  { id: "Lease", label: "Lease", icon: Timer, group: "구성", view: "table", count: 0 },
  { id: "MutatingWebhookConfiguration", label: "MutatingWebhookConfiguration", icon: FileCog, group: "구성", view: "table", count: 0 },
  { id: "PodDisruptionBudget", label: "PodDisruptionBudget", icon: ShieldCheck, group: "구성", view: "table", count: 3 },
  { id: "PriorityClass", label: "PriorityClass", icon: MoveDiagonal, group: "구성", view: "table", count: 0 },
  { id: "RuntimeClass", label: "RuntimeClass", icon: Cpu, group: "구성", view: "table", count: 0 },
  { id: "Secret", label: "Secret", icon: KeyRound, group: "구성", view: "table", count: 19 },
  { id: "ValidatingWebhookConfiguration", label: "ValidatingWebhookConfiguration", icon: ShieldCheck, group: "구성", view: "table", count: 0 },
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
const GROUP_TOTAL = (g: string) => KINDS.filter((k) => k.group === g).reduce((s, k) => s + k.count, 0);

// ── 셀 렌더러 ─────────────────────────────
function CellView({ cell, v, bad }: { cell: Cell; v: unknown; bad?: boolean }) {
  if (cell.t === "meter") {
    const m = v as { used: string; lim: string; pct: number };
    const c = m.pct >= 90 ? HP.crit : m.pct >= 60 ? HP.warn : HP.ok;
    return (
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 10.5, fontFamily: MONO, color: UI.ink2, whiteSpace: "nowrap" }}>{m.used} / {m.lim} <span style={{ color: UI.ink3 }}>{m.pct}%</span></span>
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
  if (cell.t === "ready") return <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 600, color: bad ? HP.crit : "#1F9D4D" }}>{String(v)}</span>;
  if (cell.t === "status") return <Badge text={String(v)} tone={bad ? "red" : "green"} />;
  if (cell.t === "badge") return <Badge text={String(v)} tone={bad ? "red" : cell.tone ?? "gray"} />;
  if (cell.t === "num") return <span style={{ fontSize: 11.5, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: UI.ink2 }}>{String(v)}</span>;
  if (cell.t === "ns") return <span style={{ fontSize: 11.5, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v)}</span>;
  if (cell.t === "mono") return <span style={{ fontSize: 11, fontFamily: MONO, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v)}</span>;
  return <span style={{ fontSize: 11.5, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v)}</span>;
}
function Badge({ text, tone }: { text: string; tone: "blue" | "green" | "gray" | "purple" | "red" }) {
  const S = { blue: ["#0A6CFF", "#EDF4FF", "#CFE1FB"], green: ["#1F9D4D", "#EDFAF1", "#C9EAD4"], gray: ["#5F6570", "#F4F5F7", "#E4E6EA"], purple: ["#8250DF", "#F6F1FE", "#E3D5FA"], red: ["#C43028", "#FFF3F2", "#F5CFCC"] }[tone];
  return <span style={{ display: "inline-block", fontSize: 10, fontWeight: 600, color: S[0], background: S[1], border: `1px solid ${S[2]}`, borderRadius: 5, padding: "1.5px 7px", whiteSpace: "nowrap" }}>{text}</span>;
}

// ── 종류별 표 ─────────────────────────────
function ResourceTable({ kind, q, onOpen }: { kind: Kind; q: string; onOpen: (r: Row) => void }) {
  const spec = SPEC[kind.id];
  const rows = useMemo(() => (spec ? spec.rows(rng(kind.id.length * 977 + 13)) : []), [kind.id, spec]);
  if (!spec) return null;
  const filtered = q ? rows.filter((r) => String(r.name ?? "").toLowerCase().includes(q.toLowerCase())) : rows;
  const grid = spec.cols.map((c) => c.w ?? "1fr").join(" ");
  return (
    <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 14, padding: "10px 16px", borderBottom: `1px solid ${UI.line}`, background: "#FCFCFD" }}>
        {spec.cols.map((c) => (
          <span key={c.k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.05em", color: UI.ink3 }}>
            {c.label}<ChevronDown size={9} style={{ opacity: 0.5 }} />
          </span>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: "40px 18px", textAlign: "center", fontSize: 12, color: UI.ink3 }}>
          {q ? "검색 결과가 없습니다" : `이 클러스터에 ${kind.label} 리소스가 없습니다`}
        </div>
      ) : filtered.map((row, i) => (
        <div key={i} className="rrow" onClick={() => onOpen(row)} style={{ display: "grid", gridTemplateColumns: grid, gap: 14, alignItems: "center", padding: "9px 16px", borderTop: i ? `1px solid ${UI.line2}` : "none", cursor: "pointer" }}>
          {spec.cols.map((c, ci) => (
            <span key={c.k} style={{ minWidth: 0, fontWeight: ci === 0 ? 600 : 400, color: ci === 0 ? UI.ink : undefined, fontSize: ci === 0 ? 12 : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: ci === 0 ? "nowrap" : undefined }}>
              {ci === 0 ? String(row[c.k] ?? "") : <CellView cell={c.cell} v={row[c.k]} bad={row.bad as boolean} />}
            </span>
          ))}
        </div>
      ))}
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
        <span style={{ fontSize: 12, fontWeight: 700, color: UI.ink }}>{title}</span>
        <span style={{ marginLeft: "auto" }}>{right}</span>
      </button>
      {open && children}
    </section>
  );
}
const Chip = ({ text, tone = "gray" }: { text: string; tone?: "gray" | "green" | "blue" | "purple" | "amber" | "lime" }) => {
  const S = { gray: ["#5F6570", "#F4F5F7"], green: ["#1F9D4D", "#EDFAF1"], blue: ["#0A6CFF", "#EDF4FF"], purple: ["#8250DF", "#F6F1FE"], amber: ["#B25A00", "#FFF6EA"], lime: ["#4D7C0F", "#F3FAE7"] }[tone];
  return <span style={{ display: "inline-block", fontSize: 10.5, fontFamily: MONO, color: S[0], background: S[1], borderRadius: 5, padding: "2px 7px", margin: "0 4px 4px 0", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>;
};

function KV({ k, v, mono, tone }: { k: string; v: string; mono?: boolean; tone?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "132px 1fr", gap: 12, padding: "7px 0", borderBottom: `1px solid ${UI.line2}` }}>
      <span style={{ fontSize: 11, color: UI.ink3 }}>{k}</span>
      <span style={{ fontSize: 11.5, color: tone ?? UI.ink, fontFamily: mono ? MONO : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
}

function DetailOverlay({ kind, row, onClose }: { kind: Kind; row: Row; onClose: () => void }) {
  const tabs = TABS_FOR(kind.id);
  const [tab, setTab] = useState<DetailTab>(tabs[0]);
  const [full, setFull] = useState(false); // 전체 화면 (원본 레퍼런스의 ⤢)
  const name = String(row.name ?? "");
  const ns = String(row.ns ?? "–");
  const bad = !!row.bad;
  const base = name.split("-").slice(0, 3).join("-") || name;
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
        onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(17,19,24,0.28)", backdropFilter: "blur(3px)", zIndex: 70 }} />
      <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 30, opacity: 0 }} transition={{ type: "spring", bounce: 0.06, visualDuration: 0.36 }}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: full ? "100vw" : 560, maxWidth: "100vw", background: UI.card, borderLeft: `1px solid ${UI.line}`, zIndex: 71, display: "flex", flexDirection: "column", boxShadow: "-24px 0 60px -30px rgba(17,19,24,0.3)", transition: "width .28s cubic-bezier(.32,.72,0,1)" }}>
        {/* 헤더 */}
        <div style={{ padding: "16px 20px 0", borderBottom: `1px solid ${UI.line}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(10,132,255,0.09)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <kind.icon size={15} style={{ color: BLUE }} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
              <div style={{ fontSize: 11, color: UI.ink3, marginTop: 2 }}>{kind.label} · {ns}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {[["비교", Copy], ["재시작", Play]].map(([l, I]) => (
                <button key={l as string} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 600, color: UI.ink2, cursor: "pointer" }}>
                  <I size={11} />{l as string}
                </button>
              ))}
              <button title={full ? "패널로 축소" : "전체 화면"} onClick={() => setFull(!full)} style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: "rgba(17,19,24,0.06)", color: UI.ink3, cursor: "pointer", fontSize: 11, lineHeight: 1 }}>{full ? "⤡" : "⤢"}</button>
              <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: "rgba(17,19,24,0.06)", color: UI.ink3, cursor: "pointer", fontSize: 12, lineHeight: 1 }}>✕</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, marginTop: 14 }}>
            {tabs.map((t) => {
              const on = tab === t;
              const label = DETAIL_TABS.find((d) => d.id === t)!.label;
              return (
                <button key={t} onClick={() => setTab(t)} style={{ position: "relative", border: "none", background: "transparent", cursor: "pointer", padding: "8px 12px 10px", fontSize: 12, fontWeight: on ? 700 : 500, color: on ? UI.ink : UI.ink3 }}>
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
                    <span style={{ fontSize: 12, fontWeight: 700, color: UI.ink }}>워크로드 성능 저하</span>
                    <span style={{ fontSize: 11, color: UI.ink2 }}>인스턴스 1개 사용 불가</span>
                  </div>
                </Sec>
              )}

              {/* 상태 */}
              <Sec title="상태" icon={Activity}>
                {isWorkload
                  ? ([["목표 복제본", "2"], ["현재 복제본", "2"], ["준비됨", bad ? "1" : "2"], ["최신 상태", "2"], ["가용", bad ? "1" : "2"]] as const).map(([k, v]) => <KV key={k} k={k} v={v} mono />)
                  : ([["Phase", bad ? "CrashLoopBackOff" : "Running"], ["노드", "ip-192-168-47-62.ap-northeast-2.compute.internal"], ["파드 IP", "192.168.60.243"], ["호스트 IP", "192.168.47.62"], ["QoS 클래스", "BestEffort"], ["ServiceAccount", `${base}-sa`]] as const).map(([k, v]) => <KV key={k} k={k} v={v} mono tone={k === "Phase" ? (bad ? "#C43028" : "#1F9D4D") : undefined} />)}
                <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
                  <button style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "6px 11px", fontSize: 11.5, fontWeight: 600, color: BLUE, cursor: "pointer" }}><Boxes size={12} />관리 중인 파드 보기</button>
                  {isWorkload && <button style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 8, padding: "6px 11px", fontSize: 11.5, fontWeight: 600, color: BLUE, cursor: "pointer" }}><MoveDiagonal size={12} />복제 수 조정</button>}
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
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: UI.ink }}>{comp}</span>
                    {isPod && <><Badge text="Ready" tone="green" /><Badge text="running" tone="gray" /></>}
                  </div>
                  <div style={{ fontSize: 10.5, color: UI.ink3, marginTop: 4, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(row.img ?? `registry/${base}:v1.4.2`)}</div>
                  <div style={{ fontSize: 10.5, color: UI.ink3, marginTop: 3 }}>포트: metrics 9100/TCP · webhook 7000/TCP</div>
                </div>
              </Sec>
              )}

              {/* 환경 변수 (파드 전용) */}
              {isPod && (
                <Sec title="환경 변수 (12)" defaultOpen={false}>
                  <div style={{ fontSize: 10.5, fontFamily: MONO, lineHeight: 1.9, color: UI.ink2 }}>
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
                    <span style={{ fontSize: 10, fontFamily: MONO, color: UI.ink3 }}>{t}</span>
                    <span style={{ color: HP.ok, fontSize: 12 }}>✓</span>
                    <span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: UI.ink }}>{n}</span><span style={{ display: "block", fontSize: 10.5, color: UI.ink3, marginTop: 1 }}>{d}</span></span>
                  </div>
                ))}
              </Sec>
              )}

              {/* 권한 (워크로드·파드) */}
              {wp && (
              <Sec title={`ServiceAccount 권한: ${base}-sa`} icon={ShieldCheck}>
                <div style={{ fontSize: 10.5, color: UI.ink3, marginBottom: 9 }}>직접 바인딩 1 · 그룹 상속 4 · 고유 규칙 6</div>
                {[["create", ["selfsubjectaccessreviews", "selfsubjectrulesreviews"], "authorization.k8s.io"], ["create", ["selfsubjectreviews"], "authentication.k8s.io"], ["get, list", ["pods"], ""]].map(([v, res, grp], i) => (
                  <div key={i} style={{ marginBottom: 7 }}>
                    <Chip text={v as string} tone="amber" />
                    <span style={{ fontSize: 10.5, color: UI.ink3, margin: "0 5px" }}>on</span>
                    {(res as string[]).map((rr) => <Chip key={rr} text={rr} tone="purple" />)}
                    {grp ? <><span style={{ fontSize: 10.5, color: UI.ink3, margin: "0 5px" }}>in</span><Chip text={grp as string} tone="gray" /></> : null}
                  </div>
                ))}
                <div style={{ fontSize: 10.5, color: UI.ink3, marginTop: 4 }}>규칙 1개 더 있음 · 전체 목록은 ServiceAccount에서 확인</div>
                <button style={{ border: "none", background: "transparent", color: BLUE, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: "8px 0 0" }}>전체 권한 보기 →</button>
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
                <div style={{ display: "flex", gap: 3, background: "rgba(17,19,24,0.05)", borderRadius: 8, padding: 3, marginBottom: 10 }}>
                  {["CPU", "Memory", "Net RX", "Net TX", "Disk I/O"].map((m, i) => (
                    <span key={m} style={{ flex: 1, textAlign: "center", fontSize: 10.5, fontWeight: 600, color: i === 0 ? UI.ink : UI.ink3, background: i === 0 ? "#fff" : "transparent", borderRadius: 6, padding: "5px 0", boxShadow: i === 0 ? "0 1px 3px rgba(17,19,24,0.1)" : undefined }}>{m}</span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 10.5, fontFamily: MONO, color: UI.ink3, marginBottom: 6 }}>
                  <span>현재 <b style={{ color: BLUE }}>0.6m</b></span><span>평균 <b style={{ color: UI.ink }}>0.6m</b></span><span>최대 <b style={{ color: UI.ink }}>0.7m</b></span>
                </div>
                <div style={{ border: `1px solid ${UI.line2}`, borderRadius: 10, padding: "10px 12px", background: "#FBFBFD" }}>
                  <svg viewBox="0 0 300 60" width="100%" height={60} preserveAspectRatio="none" style={{ display: "block" }}>
                    <path d="M0 42 C 30 38, 50 30, 80 34 S 130 44, 160 36 S 210 26, 240 33 S 280 40, 300 36" fill="none" stroke={BLUE} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
                    <path d="M0 42 C 30 38, 50 30, 80 34 S 130 44, 160 36 S 210 26, 240 33 S 280 40, 300 36 L 300 60 L 0 60 Z" fill={BLUE} opacity={0.08} />
                  </svg>
                </div>
              </Sec>
              )}

              {/* 데이터 (ConfigMap·Secret) */}
              {(kind.id === "ConfigMap" || kind.id === "Secret") && (
                <Sec title="데이터" icon={FileCog}>
                  {(kind.id === "Secret" ? [["username", "••••••••"], ["password", "••••••••"]] : [["feature.flags", "checkout=on, search=on"], ["api.base", "https://api.internal"]]).map(([k, v]) => (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, padding: "7px 0", borderBottom: `1px solid ${UI.line2}` }}>
                      <span style={{ fontSize: 11, fontFamily: MONO, color: BLUE }}>{k}</span>
                      <span style={{ fontSize: 11, fontFamily: MONO, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
                    </div>
                  ))}
                </Sec>
              )}

              {/* 관련 리소스 */}
              <Sec title="관련 리소스" icon={Copy}>
                {[["소유자", "rs/", `${base}-69bddf5587`, "green"], ["디플로이먼트", "deploy/", base, "green"], ["서비스", "svc/", `${base}-metrics`, "blue"],
                  ["파드", "pod/", `${base}-7494d5f69f-8kp4w`, "lime"], ["구성", "cm/", "argocd-cmd-params-cm", "amber"], ["네트워크 정책", "networkpolicy/", `${base}-network-policy`, "purple"]]
                  .map(([label, pfx, n, tone]) => (
                    <div key={label as string} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: UI.ink3, marginBottom: 4 }}>{label as string}</div>
                      <Chip text={`${pfx as string} ${n as string}`} tone={tone as "green"} />
                    </div>
                  ))}
              </Sec>

              {/* 최근 이벤트 */}
              <Sec title="최근 이벤트 (85)" icon={Activity}>
                {[["SuccessfulCreate", `파드 생성: ${base}-5j5td`], ["SuccessfulDelete", `파드 삭제: ${base}-87g9q`], ["SuccessfulCreate", `파드 생성: ${base}-vzbd9`],
                  ...(bad ? [["BackOff", "실패한 컨테이너 재시작 대기 중"]] : [])]
                  .map(([r, m], i) => (
                    <div key={i} style={{ borderLeft: `2px solid ${r === "BackOff" ? HP.crit : BLUE}`, background: r === "BackOff" ? "#FFF7F6" : "#F7FAFF", borderRadius: "0 8px 8px 0", padding: "9px 12px", marginBottom: 7 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: r === "BackOff" ? "#C43028" : UI.ink }}>{r as string}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: UI.ink3, fontFamily: MONO }}>2026. 7. 17.</span>
                      </div>
                      <div style={{ fontSize: 11, color: UI.ink2, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m as string}</div>
                    </div>
                  ))}
                <button style={{ border: "none", background: "transparent", color: UI.ink3, fontSize: 11, cursor: "pointer", padding: "4px 0 0" }}>이벤트 50건 더 보기</button>
              </Sec>

              {/* 레이블 / 어노테이션 / 메타데이터 */}
              <Sec title="레이블 (3)">
                {[`app.kubernetes.io/component=${comp}`, `app.kubernetes.io/name=${base}`, `app.kubernetes.io/part-of=${ns}`].map((l) => <Chip key={l} text={l} />)}
              </Sec>
              <Sec title="어노테이션 (1)" defaultOpen={false}>
                <div style={{ fontSize: 11, fontFamily: MONO, color: UI.ink2 }}>deployment.kubernetes.io/revision: 1</div>
              </Sec>
              <Sec title="메타데이터">
                <KV k="UID" v="16057e00-404f-460b-afa4-13bb495f3c14" mono />
                <KV k="Resource Version" v="3476048" mono />
                <KV k="Generation" v="1" mono />
                <KV k="생성 시점" v={`${String(row.age ?? "4d")} 전`} mono />
              </Sec>

              {/* 감사 결과 (워크로드·파드) */}
              {wp && (
              <Sec title="점검 결과" icon={ShieldCheck} right={<span style={{ display: "flex", gap: 8, fontSize: 10.5, fontWeight: 700 }}>{bad && <span style={{ color: "#C43028" }}>1 critical</span>}<span style={{ color: "#B25A00" }}>7 warning</span></span>}>
                {[["ServiceAccount 토큰이 자동 마운트됨", "Security"], ["컨테이너에 readiness probe 없음", "Reliability"], ["컨테이너에 liveness probe 없음", "Reliability"],
                  ["컨테이너에 CPU request 없음", "Efficiency"], ["컨테이너에 memory request 없음", "Efficiency"], ["컨테이너에 CPU limit 없음", "Efficiency"], ["복제본이 1개뿐임", "Reliability"]]
                  .map(([t, cat]) => (
                    <div key={t as string} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: `1px solid ${UI.line2}` }}>
                      <span style={{ color: "#B25A00", fontSize: 12 }}>⚠</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t as string}</span>
                      <Badge text={cat as string} tone={cat === "Security" ? "purple" : cat === "Reliability" ? "blue" : "green"} />
                    </div>
                  ))}
                <button style={{ border: "none", background: "transparent", color: BLUE, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: "9px 0 0" }}>전체 결과 보기 →</button>
              </Sec>
              )}
            </div>
          )}

          {tab === "yaml" && (
            <pre style={{ margin: 0, fontSize: 11.5, lineHeight: 1.65, fontFamily: MONO, color: UI.ink2, background: "#FBFBFD", border: `1px solid ${UI.line2}`, borderRadius: 10, padding: 14, overflowX: "auto" }}>{yaml}</pre>
          )}

          {tab === "related" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[["Service", `${name.split("-")[0]}-svc`, Plug], ["ConfigMap", "app-config", FileCog], ["Secret", "db-credentials", KeyRound], ["Node", "ip-192-168-26-122", Cpu], ["ReplicaSet", `${name}-7f9c4`, Copy]]
                .map(([k, n, I]) => (
                  <button key={n as string} className="rrow" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: `1px solid ${UI.line2}`, background: "#FBFBFD", borderRadius: 10, padding: "9px 12px", cursor: "pointer" }}>
                    <I size={13} style={{ color: UI.ink3 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 600, fontFamily: MONO, color: UI.ink }}>{n as string}</span>
                      <span style={{ display: "block", fontSize: 10, color: UI.ink3, marginTop: 1 }}>{k as string}</span>
                    </span>
                    <ChevronDown size={12} style={{ color: "#C6CAD1", transform: "rotate(-90deg)" }} />
                  </button>
                ))}
            </div>
          )}

          {tab === "events" && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[["Normal", "Scheduled", "Successfully assigned to ip-192-168-26-122", "2m"],
                ["Normal", "Pulled", 'Container image "shop:v1.4.2" already present', "2m"],
                ["Normal", "Created", "Created container: app", "2m"],
                ["Normal", "Started", "Started container app", "2m"],
                ...(bad ? [["Warning", "BackOff", "Back-off restarting failed container", "40s"]] : [])]
                .map(([t, r, m, a], i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "72px 110px 1fr 44px", gap: 10, alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${UI.line2}` }}>
                    <Badge text={t as string} tone={t === "Warning" ? "red" : "green"} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: UI.ink }}>{r as string}</span>
                    <span style={{ fontSize: 11, color: UI.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{m as string}</span>
                    <span style={{ fontSize: 10.5, fontFamily: MONO, color: UI.ink3, textAlign: "right" }}>{a as string}</span>
                  </div>
                ))}
            </div>
          )}

          {tab === "logs" && (
            <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.7, fontFamily: MONO, background: "#0F1219", color: "#D6DBE5", borderRadius: 10, padding: 14, overflowX: "auto" }}>
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
              <div style={{ fontSize: 11, color: UI.ink2, lineHeight: 1.6, marginBottom: 12 }}>
                이 리소스가 사용하는 ServiceAccount가 가진 권한입니다. 이 워크로드가 만드는 모든 파드가 아래 권한을 상속합니다.
              </div>
              <KV k="ServiceAccount" v={`${name.split("-")[0]}-sa`} mono />
              <KV k="바인딩" v="RoleBinding/app-reader · ClusterRoleBinding/metrics-view" mono />
              <div style={{ marginTop: 16, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", color: UI.ink3, marginBottom: 8 }}>유효 권한</div>
              {[["get, list, watch", "pods, services, configmaps"], ["create, patch", "events"], ["get", "secrets (app-config만)"]].map(([verbs, res]) => (
                <div key={verbs} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, padding: "7px 0", borderBottom: `1px solid ${UI.line2}` }}>
                  <span style={{ fontSize: 11, fontFamily: MONO, color: BLUE }}>{verbs}</span>
                  <span style={{ fontSize: 11, fontFamily: MONO, color: UI.ink2 }}>{res}</span>
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

// ── 좌측 종류 인덱스 ─────────────────────────────
function KindIndex({ sel, onPick, showEmpty, setShowEmpty, pinned, togglePin, filter, setFilter }: {
  sel: string; onPick: (k: Kind) => void; showEmpty: boolean; setShowEmpty: (v: boolean) => void;
  pinned: string[]; togglePin: (id: string) => void; filter: string; setFilter: (v: string) => void;
}) {
  const emptyCount = KINDS.filter((k) => k.count === 0).length;
  const match = (k: Kind) => k.label.toLowerCase().includes(filter.toLowerCase());
  const Row = ({ k }: { k: Kind }) => {
    const on = sel === k.id;
    return (
      <button onClick={() => onPick(k)} className="krow"
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: on ? "rgba(10,132,255,0.09)" : "transparent", borderRadius: 8, padding: "6px 9px" }}>
        <k.icon size={13} style={{ color: on ? BLUE : UI.ink3, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: on ? 600 : 500, color: on ? BLUE : UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</span>
        <span role="button" title="즐겨찾기" onClick={(e) => { e.stopPropagation(); togglePin(k.id); }} className="kpin" style={{ display: "grid", placeItems: "center", opacity: pinned.includes(k.id) ? 1 : 0 }}>
          <Pin size={10} style={{ color: pinned.includes(k.id) ? BLUE : UI.ink3 }} />
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, fontFamily: MONO, color: k.count ? (on ? BLUE : UI.ink2) : UI.ink3, background: on ? "rgba(10,132,255,0.12)" : "rgba(17,19,24,0.05)", borderRadius: 5, padding: "1px 6px", minWidth: 22, textAlign: "center", flexShrink: 0 }}>{k.count || (k.id === "EndpointSlice" ? "–" : 0)}</span>
      </button>
    );
  };
  return (
    <nav style={{ width: 236, flexShrink: 0, borderRight: `1px solid ${UI.line}`, paddingRight: 12, display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 18, maxHeight: "calc(100vh - 40px)", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 9, padding: "7px 10px" }}>
        <Search size={12} style={{ color: UI.ink3, flexShrink: 0 }} />
        <input value={filter} onChange={(e) => setFilter(e.currentTarget.value)} placeholder="리소스 검색…"
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 11.5, color: UI.ink, width: "100%" }} />
      </div>
      <div>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", color: UI.ink3, padding: "0 9px 5px" }}>즐겨찾기</div>
        {pinned.length === 0
          ? <div style={{ fontSize: 10.5, color: UI.ink3, padding: "0 9px 4px", lineHeight: 1.5 }}>자주 보는 종류를 핀으로 고정하면 여기에 표시됩니다</div>
          : KINDS.filter((k) => pinned.includes(k.id)).map((k) => <Row key={k.id} k={k} />)}
      </div>
      {GROUPS.map((g) => {
        const list = KINDS.filter((k) => k.group === g && (showEmpty || k.count > 0) && match(k));
        if (!list.length) return null;
        return (
          <div key={g}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 9px 5px" }}>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", color: UI.ink3 }}>{g}</span>
              <span style={{ marginLeft: "auto", fontSize: 9.5, fontFamily: MONO, color: UI.ink3 }}>{GROUP_TOTAL(g)}</span>
            </div>
            {list.map((k) => <Row key={k.id} k={k} />)}
          </div>
        );
      })}
      <button onClick={() => setShowEmpty(!showEmpty)} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: UI.ink3, fontSize: 11, cursor: "pointer", padding: "9px", borderTop: `1px solid ${UI.line2}` }}>
        <Eye size={12} />{showEmpty ? "비어 있는 종류 숨기기" : `비어 있는 종류 ${emptyCount}개 표시`}
      </button>
    </nav>
  );
}

// ── 앱 ─────────────────────────────
function App() {
  const [kindId, setKindId] = useState("Deployment");
  const [showEmpty, setShowEmpty] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [ns, setNs] = useState("모든 네임스페이스");
  const [detail, setDetail] = useState<Row | null>(null);
  const [scope, setScope] = useState<{ level: string; cluster?: string; node?: string }>({ level: "clusters" });
  const scopeLabel = scope.level === "clusters" ? "전체 클러스터" : scope.level === "nodes" ? `클러스터 ${scope.cluster}` : `노드 ${scope.node}`;
  const kind = KINDS.find((k) => k.id === kindId)!;
  const togglePin = (id: string) => setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="uni" style={{ minHeight: "100vh", background: UI.bg }}>
      {/* 상단 크롬 — 클러스터·네임스페이스·검색·자동 갱신 */}
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${UI.line}`, background: UI.card }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${UI.line}`, borderRadius: 9, padding: "6px 11px", fontSize: 12, fontWeight: 600, color: UI.ink }}>
          <Server size={13} style={{ color: UI.ink3 }} />prod-eks<ChevronDown size={12} style={{ color: UI.ink3 }} />
        </span>
        <button onClick={() => setNs(ns === "모든 네임스페이스" ? "argocd" : "모든 네임스페이스")}
          style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${UI.line}`, background: UI.card, borderRadius: 9, padding: "6px 11px", fontSize: 12, fontWeight: 600, color: UI.ink, cursor: "pointer" }}>
          <Globe size={13} style={{ color: UI.ink3 }} />{ns}<ChevronDown size={12} style={{ color: UI.ink3 }} />
        </button>
        <span className="livedot" style={{ width: 7, height: 7, borderRadius: 999, background: HP.ok }} />
        <div style={{ flex: 1, maxWidth: 520, margin: "0 auto", display: "flex", alignItems: "center", gap: 8, border: `1px solid ${UI.line}`, background: "#FBFBFD", borderRadius: 9, padding: "6px 12px" }}>
          <Search size={13} style={{ color: UI.ink3 }} />
          <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="리소스·명령 검색…" style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: UI.ink, width: "100%" }} />
          <span style={{ fontSize: 10, fontFamily: MONO, color: UI.ink3, border: `1px solid ${UI.line}`, borderRadius: 4, padding: "1px 5px" }}>⌘K</span>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: UI.ink2 }}>
          <span className="livedot" style={{ width: 6, height: 6, borderRadius: 999, background: HP.ok }} />자동 갱신
        </span>
      </header>

      <div style={{ display: "flex", gap: 16, padding: "16px 18px 40px", alignItems: "flex-start" }}>
        <KindIndex sel={kindId} onPick={(k) => setKindId(k.id)} showEmpty={showEmpty} setShowEmpty={setShowEmpty} pinned={pinned} togglePin={togglePin} filter={filter} setFilter={setFilter} />

        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* ── 드릴 맵: 클러스터 → 노드 → 파드 (스코프 탐색의 주 무대) ── */}
          <OpsiaMap embedded onScopeChange={setScope} />

          {/* ── 스코프 연동 리소스 표 — 파드뷰에선 맵이 파드 표를 이미 보여주므로 숨김(중복 제거) ── */}
          {scope.level !== "pods" && (
          <div style={{ borderTop: `1px solid ${UI.line}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <kind.icon size={15} style={{ color: BLUE }} />
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink }}>{kind.label}</span>
              <span style={{ fontSize: 11, fontFamily: MONO, color: UI.ink3 }}>{kind.count}</span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: UI.ink2, background: "rgba(17,19,24,0.045)", borderRadius: 999, padding: "3px 11px" }}>범위 · {scopeLabel}</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: UI.ink3 }}>행을 선택하면 상세 정보가 열립니다</span>
            </div>
            {/* 표 교체는 대기 없이 즉시 — exit를 기다리면 전환이 느리고, 탭 스로틀 시 멈춘다 */}
            <motion.div key={kindId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
              <ResourceTable kind={kind} q={q} onOpen={setDetail} />
            </motion.div>
          </div>
          )}
        </main>
      </div>

      {/* 상세 — 최상위 레이어 오버레이 (Esc로 닫힘) */}
      <AnimatePresence>
        {detail && <DetailOverlay key="detail" kind={kind} row={detail} onClose={() => setDetail(null)} />}
      </AnimatePresence>

      <style>{`
        .uni { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
        .uni .krow { transition: background .14s ease; }
        .uni .krow:hover { background: rgba(17,19,24,0.045); }
        .uni .krow:hover .kpin { opacity: .5 !important; }
        .uni .rrow { transition: background .12s ease; }
        .uni .rrow:hover { background: rgba(17,19,24,0.028); }
        .uni .livedot { animation: lv 1.6s ease-in-out infinite; }
        @keyframes lv { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .uni ::-webkit-scrollbar { width: 8px; } .uni ::-webkit-scrollbar-thumb { background: rgba(17,19,24,0.12); border-radius: 99px; }
        @media (prefers-reduced-motion: reduce) { .uni .livedot { animation: none !important; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
