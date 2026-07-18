/* eslint-disable react-hooks/exhaustive-deps */
// ⚠ 데모 · 환경 연결 마법사. 런처 → (A)Git 저장소 등록 / (B)클러스터 연결(에이전트 설치). motion. 전부 더미·하드코딩(비주얼 데모).
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, ChevronRight, Copy, Folder, GitBranch, Globe,
  Lock, Search, Server, Sparkles, X,
} from "lucide-react";
// 브랜드 로고 — 인라인 SVG (Simple Icons). tabler 의존 제거로 데모 안정성 확보.
type BrandIconProps = { size?: number; stroke?: number; style?: React.CSSProperties };
const IconBrandAws = ({ size = 21, style }: BrandIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden>
    <path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.383.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z"/>
  </svg>
);
const IconBrandGoogle = ({ size = 21, style }: BrandIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden>
    <path d="M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02-.055.013 0 0-3.875 2.551-3.922 8.11-.247 10.941l.006-.007-.007.03a6.717 6.717 0 0 0 4.077 1.356h5.173l.03.03h5.192c6.687.053 9.376-8.605 3.835-12.35a9.365 9.365 0 0 0-2.821-4.552l-.043.043.006-.05A9.344 9.344 0 0 0 12.19 2.38zm-.358 4.146c1.244-.04 2.518.368 3.486 1.15a5.186 5.186 0 0 1 1.862 4.078v.518c3.53-.07 3.53 5.262 0 5.193h-5.193l-.008.009v-.04H6.785a2.59 2.59 0 0 1-1.067-.23h.001a2.597 2.597 0 1 1 3.437-3.437l3.013-3.012A6.747 6.747 0 0 0 8.11 8.24c.018-.01.04-.026.054-.023a5.186 5.186 0 0 1 3.67-1.69z"/>
  </svg>
);
const IconBrandAzure = ({ size = 21, style }: BrandIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden>
    <path d="M22.379 23.343a1.62 1.62 0 0 0 1.536-2.14v.002L17.35 1.76A1.62 1.62 0 0 0 15.816.657H8.184A1.62 1.62 0 0 0 6.65 1.76L.086 21.204a1.62 1.62 0 0 0 1.536 2.139h4.741a1.62 1.62 0 0 0 1.535-1.103l.977-2.892 4.947 3.675c.28.208.618.32.966.32m-3.084-12.531 3.624 10.739a.54.54 0 0 1-.51.713v-.001h-.03a.54.54 0 0 1-.322-.106l-9.287-6.9h4.853m6.313 7.006c.116-.326.13-.694.007-1.058L9.79 1.76a1.722 1.722 0 0 0-.007-.02h6.034a.54.54 0 0 1 .512.366l6.562 19.445a.54.54 0 0 1-.338.684"/>
  </svg>
);
const IconBrandDocker = ({ size = 21, style }: BrandIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden>
    <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z"/>
  </svg>
);
import { Spinner } from "./shared/ui/primitives/spinner";
import { emitAction } from "./devpreview/bus";
import "./styles/tokens.css";
import "./styles/foundation.css";

const EASE = [0.32, 0.72, 0, 1] as const;
const T = { detectMs: 1500, tokenMs: 1200, agentMs: 2200 } as const;
const SPRING = { type: "spring", visualDuration: 0.34, bounce: 0.28 } as const;
const swap = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.3, ease: EASE },
};

const PATH = "deploy/prod";
const MANIFESTS = [
  { file: "deployment.yaml", kind: "Deployment", sub: "shop-api", strategy: "RollingUpdate" },
  { file: "rollout.yaml", kind: "Argo Rollout", sub: "shop-web", strategy: "Canary" },
  { file: "service.yaml", kind: "Service", sub: "shop-api" },
  { file: "ingress.yaml", kind: "Ingress", sub: "shop.opsia.io" },
  { file: "configmap.yaml", kind: "ConfigMap", sub: "app-config" },
  { file: "hpa.yaml", kind: "HorizontalPodAutoscaler", sub: "shop-api" },
];
// 이미 연결된 클러스터(데모) — 배포 대상 후보
const CLUSTERS = [
  { id: "cluster-1", env: "prod", region: "ap-northeast-2", dot: "dot-r" },
  { id: "cluster-2", env: "staging", region: "ap-northeast-2", dot: "dot-o" },
  { id: "cluster-3", env: "dev", region: "us-west-2", dot: "dot-g" },
];
const REPO_STEPS = ["저장소", "매니페스트", "배포"];
const CLUSTER_STEPS = ["정보", "설치", "연결"];
const CLUSTER_ENVS = ["prod", "staging", "dev"];

// 설치 플랫폼 · 플랫폼마다 자격증명 획득 방식과 명령이 다름 (토큰은 항상 마스킹)
// ⚠ 브랜드 로고는 상표라 브랜드 컬러+대표 아이콘으로 표현. 실제 로고 SVG로 교체 가능.
const PLATFORMS = [
  { id: "aws", name: "Amazon EKS", sub: "AWS", color: "#FF9900", icon: IconBrandAws },
  { id: "gcp", name: "Google GKE", sub: "GCP", color: "#4285F4", icon: IconBrandGoogle },
  { id: "azure", name: "Azure AKS", sub: "Azure", color: "#0078D4", icon: IconBrandAzure },
  { id: "docker", name: "Docker", sub: "로컬", color: "#2496ED", icon: IconBrandDocker },
] as const;
type PlatformId = (typeof PLATFORMS)[number]["id"];
const TOK = "••••••••••••••••••••••••";
function buildInstall(platform: PlatformId, name: string, env: string): string {
  const n = name || "my-cluster";
  const helm = `helm repo add opsia https://charts.opsia.io\nhelm install opsia-agent opsia/agent \\\n  --namespace opsia-system --create-namespace \\\n  --set cluster.name=${n} --set cluster.env=${env} \\\n  --set token=${TOK}`;
  switch (platform) {
    case "aws":
      return `aws eks update-kubeconfig --name ${n} --region ap-northeast-2\n${helm}`;
    case "gcp":
      return `gcloud container clusters get-credentials ${n} \\\n  --region asia-northeast3\n${helm}`;
    case "azure":
      return `az aks get-credentials --name ${n} \\\n  --resource-group opsia-rg\n${helm}`;
    case "docker":
      return `docker run -d --name opsia-agent \\\n  --restart unless-stopped \\\n  -v /var/run/docker.sock:/var/run/docker.sock \\\n  -e OPSIA_CLUSTER=${n} -e OPSIA_ENV=${env} \\\n  -e OPSIA_TOKEN=${TOK} \\\n  opsia/agent:latest`;
  }
}

// Git 저장소 주소 검증 · 아니면 null (데모 휴리스틱)
type Repo = { full: string; visibility: "public" | "private"; branch: string; count: number };
function parseRepo(v: string): Repo | null {
  const raw = v.trim();
  if (!raw) return null;
  let s = raw.replace(/^git@([^:]+):/i, "$1/");
  s = s.replace(/^[a-z]+:\/\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  const segs = s.split("/").filter(Boolean);
  const hostLike = (segs[0] || "").includes(".");
  const gitHost = /(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|gitea|git)/i.test(segs[0] || "");
  let owner: string | undefined, repo: string | undefined;
  if (hostLike) {
    if (!gitHost) return null;
    owner = segs[1]; repo = segs[2];
  } else {
    if (segs.length < 2) return null;
    owner = segs[0]; repo = segs[1];
  }
  if (!owner || !repo) return null;
  if (/\.[a-z0-9]{2,5}$/i.test(repo)) return null;
  return { full: `${owner}/${repo}`, visibility: /public|open/i.test(raw) ? "public" : "private", branch: "main", count: MANIFESTS.length };
}

// ── 공용 프리미티브 ─────────────────────────────
const Spin = ({ c = "size-4" }: { c?: string }) => <Spinner className={c} decorative />;

function Checkbox({ on }: { on: boolean }) {
  return (
    <span className={`grid size-[19px] shrink-0 place-items-center rounded-[6px] border transition-colors ${on ? "border-transparent bg-accent" : "check-off"}`}>
      <AnimatePresence>{on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING}><Check className="size-3 text-white" strokeWidth={3.5} /></motion.span>}</AnimatePresence>
    </span>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span style={{ position: "relative", flexShrink: 0, width: 46, height: 28, borderRadius: 999, background: on ? "var(--green)" : "rgba(0,0,0,0.16)", transition: "background .22s ease" }}>
      <motion.span layout transition={{ type: "spring", visualDuration: 0.2, bounce: 0.35 }} style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.28)" }} />
    </span>
  );
}

function NextButton({ show, label, onClick }: { show: boolean; label: string; onClick: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div key="next" initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: "auto", marginTop: 4 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} transition={{ duration: 0.28, ease: EASE }} className="overflow-hidden">
          <button onClick={onClick} className="btn-primary flex w-full items-center justify-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em]" style={{ borderRadius: 14, paddingTop: 14, paddingBottom: 14 }}>
            {label} <ArrowRight className="size-[17px]" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const BackBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="btn-ghost grid shrink-0 place-items-center" style={{ borderRadius: 14, width: 50, height: 50 }}><ArrowLeft className="size-[18px] c-2" /></button>
);

function ShellHeader({ icon: Icon, title, sub, onClose }: { icon: typeof Server; title: string; sub: string; onClose: () => void }) {
  return (
    <>
      <div className="flex items-center gap-4" style={{ padding: "30px 36px 24px" }}>
        <span className="grid size-12 shrink-0 place-items-center hdr-grad text-white" style={{ borderRadius: 15, boxShadow: "0 8px 18px -6px rgba(47,91,255,0.5)" }}><Icon className="size-[22px]" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-semibold tracking-[-0.02em] c-ink">{title}</h1>
          <p className="mt-1 text-[13px] c-2">{sub}</p>
        </div>
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full c-3 transition-colors hover:bg-soft" style={{ marginTop: -4 }}><X className="size-5" /></button>
      </div>
      <div style={{ padding: "0 36px" }}><div className="hairline" /></div>
    </>
  );
}

function Steps({ steps, active }: { steps: string[]; active: number }) {
  return (
    <div className="flex items-center" style={{ padding: "26px 36px 0" }}>
      {steps.map((s, i) => {
        const done = i < active, now = i === active;
        return (
          <div key={s} className="flex items-center" style={{ flex: i < steps.length - 1 ? "1 1 0%" : "0 0 auto" }}>
            <div className="flex items-center gap-3">
              <motion.span layout className="grid shrink-0 place-items-center rounded-full font-bold" style={{ width: 34, height: 34, fontSize: 15 }}
                animate={{ backgroundColor: done || now ? "var(--accent)" : "rgba(0,0,0,0.07)", color: done || now ? "#fff" : "var(--ink-3)", boxShadow: now ? "0 0 0 5px rgba(0,113,227,0.15)" : "0 0 0 0px rgba(0,113,227,0)" }} transition={{ duration: 0.3 }}>
                {done ? <Check className="size-[18px]" strokeWidth={3} /> : i + 1}
              </motion.span>
              <span className="text-[14.5px] font-semibold tracking-[-0.01em]" style={{ color: done || now ? "var(--ink)" : "var(--ink-3)" }}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="mx-3 h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
                <motion.div className="h-full bg-accent" initial={false} animate={{ width: done ? "100%" : "0%" }} transition={{ duration: 0.4, ease: EASE }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const Body = ({ children }: { children: React.ReactNode }) => <div style={{ padding: "28px 36px 34px" }}><AnimatePresence mode="wait">{children}</AnimatePresence></div>;

// ── A. Git 저장소 등록 ─────────────────────────────
function RepoStep({ onNext }: { onNext: (v: string) => void }) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "detecting" | "found" | "error">("idle");
  const [repo, setRepo] = useState<Repo | null>(null);
  const [token, setToken] = useState("");
  const [tok, setTok] = useState<"idle" | "verifying" | "ok">("idle");

  const handleInputChange = (v: string) => {
    setInput(v);
    setRepo(null);
    setToken("");
    setTok("idle");
    setStatus(v.trim() ? "detecting" : "idle");
  };

  useEffect(() => {
    const v = input.trim(); if (!v) return;
    const id = window.setTimeout(() => {
      const parsed = parseRepo(v);
      if (!parsed) { setStatus("error"); return; }
      setRepo(parsed); setStatus("found");
    }, T.detectMs);
    return () => window.clearTimeout(id);
  }, [input]);

  const handleTokenChange = (v: string) => {
    setToken(v);
    setTok(repo?.visibility === "private" && v.trim() ? "verifying" : "idle");
  };

  useEffect(() => {
    if (repo?.visibility !== "private" || !token.trim()) return;
    const id = window.setTimeout(() => setTok("ok"), T.tokenMs);
    return () => window.clearTimeout(id);
  }, [token, repo]);

  const ready = status === "found" && (repo?.visibility === "public" || tok === "ok");

  return (
    <motion.div key="repo" {...swap} className="grid gap-5">
      <p className="text-[14px] leading-[1.55] c-2">Git 저장소 주소를 붙여넣으면 접근 권한과 매니페스트를 자동으로 확인합니다.</p>

      <div className="field flex items-center gap-3 bg-surface" style={{ borderRadius: 14, padding: "15px 16px" }}>
        {status === "detecting" ? <Spin c="size-[18px] c-accent" /> : <Search className="size-[18px] c-3" />}
        <input autoFocus value={input} onChange={(e) => handleInputChange(e.currentTarget.value)} placeholder="https://github.com/org/repo" className="w-full bg-transparent font-mono text-[14px] c-ink outline-none placeholder:font-sans placeholder:c-3" />
      </div>

      <AnimatePresence mode="popLayout">
        {status === "detecting" && (
          <motion.p key="det" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-0.5 text-[13px] c-2"><Spin c="size-3.5 c-accent" /> 저장소 확인 중…</motion.p>
        )}
        {status === "error" && (
          <motion.div key="err" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING} className="flex items-center gap-3.5 err-bg" style={{ borderRadius: 16, padding: "15px 18px" }}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full err-ic-bg"><AlertCircle className="size-5 c-red" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold c-ink">저장소를 찾을 수 없어요</div>
              <div className="mt-0.5 text-[12.5px] c-2">Git 저장소 주소가 맞는지 확인해주세요 · 예: github.com/org/repo</div>
            </div>
          </motion.div>
        )}
        {status === "found" && repo && (
          <motion.div key="found" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="grid gap-4">
            <div className="flex items-center gap-4 bg-soft" style={{ borderRadius: 16, padding: "16px 18px" }}>
              <span className="grid size-11 shrink-0 place-items-center bg-surface" style={{ borderRadius: 13, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}><Folder className="size-[22px] c-2" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <span className="truncate text-[15px] font-semibold tracking-[-0.015em] c-ink">{repo.full}</span>
                  {repo.visibility === "private"
                    ? <span className="inline-flex items-center gap-1 rounded-full orange-bg px-2 py-[3px] text-[11px] font-semibold c-orange"><Lock className="size-3" strokeWidth={2.5} />비공개</span>
                    : <span className="inline-flex items-center gap-1 rounded-full green-bg px-2 py-[3px] text-[11px] font-semibold c-green"><Globe className="size-3" strokeWidth={2.5} />공개</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] c-2">
                  <GitBranch className="size-3.5 c-3" /><span className="font-mono">{repo.branch}</span><span className="c-3">·</span>
                  <Folder className="size-3.5 c-3" /><span className="font-mono truncate">{PATH}</span><span className="c-3">·</span><span>매니페스트 {repo.count}개</span>
                </div>
              </div>
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING} className="grid size-6 shrink-0 place-items-center rounded-full green-bg"><Check className="size-[15px] c-green" strokeWidth={3} /></motion.span>
            </div>

            <AnimatePresence>
              {repo.visibility === "private" && (
                <motion.div key="tok" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.32, ease: EASE }} className="overflow-hidden">
                  <div className="grid gap-2.5 pt-1">
                    <span className="px-0.5 text-[12.5px] font-medium c-2">비공개 저장소예요 · 액세스 토큰이 필요합니다</span>
                    <div className="field flex items-center gap-3 bg-surface" style={{ borderRadius: 14, padding: "15px 16px" }}>
                      <Lock className="size-[18px] c-3" />
                      <input value={token} onChange={(e) => handleTokenChange(e.currentTarget.value)} placeholder="ghp_••••••••••••••••" className="w-full bg-transparent font-mono text-[14px] c-ink outline-none placeholder:c-3" />
                      <AnimatePresence mode="wait">
                        {tok === "verifying" && <motion.span key="v" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Spin c="size-[18px] c-accent" /></motion.span>}
                        {tok === "ok" && <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING}><Check className="size-[18px] c-green" strokeWidth={3} /></motion.span>}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <NextButton show={ready} label="다음" onClick={() => repo && onNext(repo.full)} />
    </motion.div>
  );
}

function ManifestStep({ repo, onBack, onNext }: { repo: string; onBack: () => void; onNext: (n: number) => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>({ "deployment.yaml": true, "rollout.yaml": true });
  const count = Object.values(sel).filter(Boolean).length;
  const all = count === MANIFESTS.length;
  return (
    <motion.div key="manifests" {...swap} className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[12.5px]"><Folder className="size-[15px] shrink-0 c-3" /><span className="truncate font-mono c-2"><span className="c-ink font-medium">{repo}</span>/{PATH}</span></div>
        <button onClick={() => setSel(all ? {} : Object.fromEntries(MANIFESTS.map((m) => [m.file, true])))} className="shrink-0 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold c-accent transition-colors hover:bg-soft">{all ? "전체 해제" : "전체 선택"}</button>
      </div>

      <div className="inset overflow-y-auto" style={{ maxHeight: 300 }}>
        {MANIFESTS.map((m) => {
          const on = !!sel[m.file];
          return (
            <button key={m.file} onClick={() => setSel((s) => ({ ...s, [m.file]: !on }))} className={`inset-row ${on ? "inset-row-on" : ""}`}>
              <Checkbox on={on} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium tracking-[-0.005em] c-ink">{m.file}</div>
                <div className="mt-[3px] text-[11.5px] c-3">{m.kind} · {m.sub}</div>
              </div>
              {m.strategy && <span className="badge shrink-0">{m.strategy}</span>}
            </button>
          );
        })}
      </div>
      <p className="px-0.5 text-[11.5px] c-3">전략은 매니페스트에 정의된 값을 그대로 감지해 표시합니다.</p>

      <div className="mt-1 flex items-center gap-2.5">
        <BackBtn onClick={onBack} />
        <div className="flex-1"><NextButton show={count > 0} label={`${count}개 등록 · 다음`} onClick={() => onNext(count)} /></div>
      </div>
    </motion.div>
  );
}

function DeployStep({ onBack, onDeploy }: { onBack: () => void; onDeploy: (clusters: string[], ns: string) => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>({ "cluster-2": true });
  const chosen = CLUSTERS.filter((c) => sel[c.id]).map((c) => c.id);
  const [ns, setNs] = useState("shop");
  const [autoSync, setAutoSync] = useState(true);
  const [prune, setPrune] = useState(false);
  return (
    <motion.div key="deploy" {...swap} className="grid gap-6">
      <div className="grid gap-2.5">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[12.5px] font-semibold c-2">배포 클러스터</span>
          <span className="text-[11.5px] c-3">{chosen.length}개 선택 · 여러 곳에 배포할 수 있어요</span>
        </div>
        <div className="inset">
          {CLUSTERS.map((c) => {
            const on = !!sel[c.id];
            return (
              <button key={c.id} onClick={() => setSel((s) => ({ ...s, [c.id]: !on }))} className={`inset-row ${on ? "inset-row-on" : ""}`}>
                <Checkbox on={on} />
                <span className={`size-2.5 shrink-0 rounded-full ${c.dot}`} />
                <span className="flex-1 text-[14px] font-medium c-ink">{c.id}<span className="ml-2 text-[12.5px] font-normal c-3">{c.env} · {c.region}</span></span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2.5">
        <span className="px-0.5 text-[12.5px] font-semibold c-2">네임스페이스</span>
        <div className="field flex items-center bg-surface" style={{ borderRadius: 14, padding: "13px 15px" }}>
          <input value={ns} onChange={(e) => setNs(e.currentTarget.value)} className="w-full bg-transparent font-mono text-[13.5px] c-ink outline-none" />
        </div>
      </div>

      <div className="grid gap-2.5">
        <span className="px-0.5 text-[12.5px] font-semibold c-2">동기화 정책</span>
        <div className="inset">
          <button onClick={() => setAutoSync((v) => !v)} className="inset-row">
            <div className="min-w-0 flex-1"><div className="text-[14px] font-medium c-ink">자동 동기화</div><div className="mt-0.5 text-[12px] c-3">Git 변경을 감지해 자동으로 반영합니다</div></div>
            <Switch on={autoSync} />
          </button>
          <button onClick={() => setPrune((v) => !v)} className="inset-row">
            <div className="min-w-0 flex-1"><div className="text-[14px] font-medium c-ink">자동 정리 (Prune)</div><div className="mt-0.5 text-[12px] c-3">Git에서 삭제된 리소스를 클러스터에서도 제거합니다</div></div>
            <Switch on={prune} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <BackBtn onClick={onBack} />
        <button onClick={() => chosen.length && onDeploy(chosen, ns)} disabled={!chosen.length} className="btn-primary flex flex-1 items-center justify-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em] disabled:opacity-40" style={{ borderRadius: 14, paddingTop: 14, paddingBottom: 14 }}>
          연결하고 배포 <ArrowRight className="size-[17px]" />
        </button>
      </div>
    </motion.div>
  );
}

function RepoWizard({ onClose, onToast }: { onClose: () => void; onToast: (t: ToastData) => void }) {
  const [step, setStep] = useState(0);
  const [repo, setRepo] = useState("Jungle-303-04/final");
  const [files, setFiles] = useState(2);
  const el = {
    0: <RepoStep key="s0" onNext={(v) => { setRepo(v); setStep(1); }} />,
    1: <ManifestStep key="s1" repo={repo} onBack={() => setStep(0)} onNext={(n) => { setFiles(n); setStep(2); }} />,
    2: <DeployStep key="s2" onBack={() => setStep(1)} onDeploy={(clusters, ns) => onToast({
      title: "환경 배포", ref: repo, doneTitle: "배포 완료", doneSub: `${clusters.join(", ")} · ${ns}`,
      stages: [{ label: "배포를 준비하는 중", ms: 850 }, { label: `매니페스트 ${files}개 적용 중`, ms: 1100 }, { label: `${clusters.length}개 클러스터 동기화 중`, ms: 1000 }],
    })} />,
  }[step];
  return (<><ShellHeader icon={GitBranch} title="Git 저장소 연결" sub="저장소를 연결하면 매니페스트가 클러스터에 배포·동기화됩니다" onClose={onClose} /><Steps steps={REPO_STEPS} active={step} /><Body>{el}</Body></>);
}

// ── B. 클러스터 연결 (에이전트 설치) ─────────────────────────────
function ClusterInfoStep({ name, setName, platform, setPlatform, env, setEnv, onNext }: { name: string; setName: (v: string) => void; platform: PlatformId; setPlatform: (v: PlatformId) => void; env: string; setEnv: (v: string) => void; onNext: () => void }) {
  return (
    <motion.div key="cinfo" {...swap} className="grid gap-5">
      <div className="grid gap-2.5">
        <span className="px-0.5 text-[12.5px] font-semibold c-2">플랫폼</span>
        <div className="grid grid-cols-2 gap-2.5">
          {PLATFORMS.map((p) => {
            const on = platform === p.id; const Icon = p.icon;
            return (
              <button key={p.id} onClick={() => setPlatform(p.id)} className={`card flex items-center gap-3 ${on ? "card-on" : ""}`} style={{ borderRadius: 14, padding: "12px 13px" }}>
                <span className="grid shrink-0 place-items-center" style={{ width: 34, height: 34, borderRadius: 10, background: `${p.color}1A` }}><Icon size={21} stroke={2} style={{ color: p.color }} /></span>
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold tracking-[-0.01em] c-ink">{p.name}</div><div className="text-[11px] c-3">{p.sub}</div></div>
                {/* 체크 자리를 항상 고정폭으로 예약 — 선택 시 레이아웃이 밀리지 않는다 */}
                <span className="grid shrink-0 place-items-center" style={{ width: 18, height: 18 }}>
                  <motion.span animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }} initial={false} transition={{ type: "spring", visualDuration: 0.26, bounce: 0.3 }} style={{ display: "grid" }}>
                    <Check className="size-[17px] c-accent" strokeWidth={3} />
                  </motion.span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2.5">
        <span className="px-0.5 text-[12.5px] font-semibold c-2">클러스터 이름</span>
        <div className="field flex items-center gap-3 bg-surface" style={{ borderRadius: 14, padding: "15px 16px" }}>
          <Server className="size-[18px] c-3" />
          <input autoFocus value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="prod-eks-apne2" className="w-full bg-transparent font-mono text-[14px] c-ink outline-none placeholder:font-sans placeholder:c-3" />
        </div>
      </div>
      <div className="grid gap-2.5">
        <div className="flex items-center gap-2 px-0.5"><span className="text-[12.5px] font-semibold c-2">환경</span><span className="text-[11.5px] c-3">이 클러스터의 용도 라벨</span></div>
        <div className="seg flex" style={{ borderRadius: 14, padding: 4 }}>
          {CLUSTER_ENVS.map((e) => (
            <button key={e} onClick={() => setEnv(e)} className="relative flex-1 text-[13px] font-semibold" style={{ borderRadius: 10, padding: "9px 0" }}>
              {env === e && <motion.span layoutId="cenv" className="absolute inset-0 bg-surface" style={{ borderRadius: 10, boxShadow: "0 2px 6px -1px rgba(17,19,24,0.12)" }} transition={{ type: "spring", visualDuration: 0.28, bounce: 0.18 }} />}
              <span className="relative" style={{ color: env === e ? "var(--ink)" : "var(--ink-3)" }}>{e}</span>
            </button>
          ))}
        </div>
      </div>
      <NextButton show={name.trim().length > 1} label="설치 명령 생성" onClick={onNext} />
    </motion.div>
  );
}

function ClusterInstallStep({ platform, name, env, onBack, onConnected }: { platform: PlatformId; name: string; env: string; onBack: () => void; onConnected: () => void }) {
  const [copied, setCopied] = useState(false);
  const pf = PLATFORMS.find((p) => p.id === platform)!;
  const Icon = pf.icon;
  const cmd = buildInstall(platform, name, env);
  const copy = () => { navigator.clipboard?.writeText(cmd).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
  // 명령 전달 후 자동으로 에이전트 연결을 기다렸다가 연결되면 다음 단계로.
  useEffect(() => {
    const id = window.setTimeout(onConnected, 2900);
    return () => window.clearTimeout(id);
  }, []);
  const target = platform === "docker" ? "로컬 Docker 호스트" : "클러스터";
  return (
    <motion.div key="cinstall" {...swap} className="grid gap-5">
      <p className="text-[14px] leading-[1.55] c-2">아래 명령을 <span className="c-ink font-medium">{target}에서</span> 실행하면 에이전트가 자동으로 연결됩니다.</p>

      <div className="cmd overflow-hidden" style={{ borderRadius: 16 }}>
        <div className="flex items-center justify-between" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
          <span className="flex items-center gap-2 text-[12px] font-semibold c-2"><Icon size={15} stroke={2} style={{ color: pf.color }} />opsia-agent · {pf.name}</span>
          <button onClick={copy} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors" style={{ color: copied ? "var(--green)" : "var(--ink-2)", background: copied ? "rgba(34,197,94,0.12)" : "rgba(17,19,24,0.05)" }}>
            {copied ? <><Check className="size-3.5" strokeWidth={3} />복사됨</> : <><Copy className="size-3.5" />복사</>}
          </button>
        </div>
        <pre className="overflow-x-auto font-mono text-[12.5px] leading-[1.7] c-ink" style={{ padding: "14px 16px" }}>{cmd}</pre>
      </div>

      <div className="inset flex items-center gap-3" style={{ padding: "15px 16px" }}>
        <span className="relative grid size-8 shrink-0 place-items-center">
          <span className="absolute inline-flex size-8 animate-ping rounded-full ping-g" />
          <span className="relative inline-flex size-2.5 rounded-full dot-g" />
        </span>
        <span className="flex-1 text-[13.5px] font-medium c-ink">에이전트 연결을 기다리는 중…</span>
        <Spin c="size-[18px] c-accent" />
      </div>

      <div className="flex"><BackBtn onClick={onBack} /></div>
    </motion.div>
  );
}

function ClusterDoneStep({ platform, name, env, onDone }: { platform: PlatformId; name: string; env: string; onDone: () => void }) {
  const info = platform === "docker"
    ? [{ k: "컨테이너", v: "12" }, { k: "이미지", v: "8" }, { k: "엔진", v: "27.1" }]
    : [{ k: "노드", v: "3" }, { k: "버전", v: "v1.29.4" }, { k: "파드", v: "42" }];
  return (
    <motion.div key="cdone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="grid gap-5">
      <div className="flex flex-col items-center gap-3 pt-1 text-center">
        <motion.span initial={{ scale: 0, rotate: -18 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", visualDuration: 0.45, bounce: 0.5 }} className="grid size-16 place-items-center rounded-full lime-bg"><Check className="size-8 c-ink" strokeWidth={3} /></motion.span>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <div className="text-[19px] font-bold tracking-[-0.02em] c-ink">클러스터가 연결됐어요</div>
          <div className="mt-1 text-[13.5px] c-2"><span className="font-mono c-ink">{name}</span> · {env} · opsia-agent 실행 중</div>
        </motion.div>
      </div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="stat">
        {info.map((x, i) => (
          <div key={x.k} className="flex-1 text-center" style={{ padding: "15px 0", borderLeft: i ? "1px solid rgba(17,19,24,0.06)" : "none" }}>
            <div className="text-[19px] font-bold tracking-[-0.01em] c-ink">{x.v}</div>
            <div className="mt-0.5 text-[11.5px] font-medium c-3">{x.k}</div>
          </div>
        ))}
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center gap-2.5 bg-soft" style={{ borderRadius: 14, padding: "13px 16px" }}>
        <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full ping-g" /><span className="relative inline-flex size-2.5 rounded-full dot-g" /></span>
        <span className="text-[13px] font-medium c-ink">메트릭·이벤트 수집 중</span>
        <span className="ml-auto text-[12px] c-3">실시간</span>
      </motion.div>
      <button onClick={onDone} className="btn-primary flex w-full items-center justify-center text-[15px] font-semibold" style={{ borderRadius: 14, paddingTop: 14, paddingBottom: 14 }}>완료</button>
    </motion.div>
  );
}

function ClusterWizard({ onClose, onToast }: { onClose: () => void; onToast: (t: ToastData) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("prod-eks-apne2");
  const [platform, setPlatform] = useState<PlatformId>("aws");
  const [env, setEnv] = useState("prod");
  const el = {
    0: <ClusterInfoStep key="c0" name={name} setName={setName} platform={platform} setPlatform={setPlatform} env={env} setEnv={setEnv} onNext={() => setStep(1)} />,
    1: <ClusterInstallStep key="c1" platform={platform} name={name} env={env} onBack={() => setStep(0)} onConnected={() => setStep(2)} />,
    2: <ClusterDoneStep key="c2" platform={platform} name={name} env={env} onDone={() => onToast({
      title: "클러스터 연결", ref: name, doneTitle: "클러스터 연결됨", doneSub: `${name} · 메트릭 수집 시작`,
      stages: [{ label: "에이전트 핸드셰이크", ms: 700 }, { label: "RBAC 권한 확인", ms: 800 }, { label: "메트릭 스트림 연결", ms: 800 }],
    })} />,
  }[step];
  return (<><ShellHeader icon={Server} title="클러스터 연결" sub="에이전트를 설치하면 클러스터가 안전하게 등록·관측됩니다" onClose={onClose} /><Steps steps={CLUSTER_STEPS} active={step} /><Body>{el}</Body></>);
}

// ── 토스트(최상위 알림) ─────────────────────────────
type ToastData = { title: string; ref: string; doneTitle: string; doneSub: string; stages: { label: string; ms: number }[] };
function Toast({ data, onClose }: { data: ToastData; onClose: () => void }) {
  const [stage, setStage] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timers: number[] = [];
    let acc = 0;
    data.stages.forEach((s, k) => { acc += s.ms; timers.push(window.setTimeout(() => setStage(k + 1), acc)); });
    timers.push(window.setTimeout(() => setDone(true), acc + 150));
    timers.push(window.setTimeout(onClose, acc + 3000));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);
  const total = data.stages.length;
  const pct = done ? 100 : Math.max(8, (stage / total) * 100);
  const label = done ? data.doneSub : `${data.stages[Math.min(stage, total - 1)].label}…`;
  return (
    <motion.div initial={{ opacity: 0, y: -22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.98 }} transition={{ type: "spring", visualDuration: 0.42, bounce: 0.3 }} className="notif absolute overflow-hidden" style={{ width: 360, borderRadius: 20, top: 24, right: 24 }}>
      <div className="flex items-center gap-3.5" style={{ padding: "14px 16px" }}>
        <span className="grid size-10 shrink-0 place-items-center text-white" style={{ borderRadius: 13, background: done ? "var(--lime)" : "var(--blue)" }}>
          <AnimatePresence mode="wait">
            {done ? <motion.span key="c" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING}><Check className="size-[19px] text-white" strokeWidth={3} /></motion.span> : <motion.span key="s"><Spinner className="size-[19px]" decorative /></motion.span>}
          </AnimatePresence>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="text-[13.5px] font-semibold tracking-[-0.01em] c-ink">{done ? data.doneTitle : data.title}</span><span className="truncate font-mono text-[11px] c-3">{data.ref}</span></div>
          <div className="mt-0.5 h-[16px] overflow-hidden">
            <AnimatePresence mode="wait"><motion.div key={label} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }} className="truncate text-[12px] c-2">{label}</motion.div></AnimatePresence>
          </div>
        </div>
      </div>
      <div className="h-[3px] w-full" style={{ background: "rgba(17,19,24,0.06)" }}><motion.div className={done ? "h-full bg-lime" : "h-full bg-accent"} initial={{ width: "8%" }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: EASE }} /></div>
    </motion.div>
  );
}

// ── 런처 ─────────────────────────────
function Launcher({ onPick }: { onPick: (v: "repo" | "cluster") => void }) {
  const items = [
    { id: "repo" as const, icon: GitBranch, title: "Git 저장소 연결", sub: "레포의 매니페스트를 클러스터에 배포·동기화" },
    { id: "cluster" as const, icon: Server, title: "클러스터 연결", sub: "에이전트를 설치해 클러스터를 등록·관측" },
  ];
  return (
    <div className="absolute inset-0 grid place-items-center px-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", visualDuration: 0.4, bounce: 0.2 }} className="modal-surface" style={{ width: 460, maxWidth: "100%", borderRadius: 24, boxShadow: "0 30px 70px -26px rgba(0,0,0,0.35)", padding: 28 }}>
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center hdr-grad text-white" style={{ borderRadius: 10 }}><Sparkles className="size-[17px]" /></span>
          <div><h1 className="text-[16px] font-semibold tracking-[-0.02em] c-ink">환경 연결</h1></div>
        </div>
        <p className="mt-2 text-[13px] c-2">무엇을 연결할까요?</p>
        <div className="mt-4 inset">
          {items.map(({ id, icon: Icon, title, sub }) => (
            <button key={id} onClick={() => onPick(id)} className="inset-row">
              <span className="grid size-10 shrink-0 place-items-center bg-soft" style={{ borderRadius: 12 }}><Icon className="size-[19px] c-accent" /></span>
              <div className="min-w-0 flex-1"><div className="text-[14.5px] font-semibold tracking-[-0.01em] c-ink">{title}</div><div className="mt-0.5 text-[12px] c-3">{sub}</div></div>
              <ChevronRight className="size-[18px] shrink-0 c-3" />
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ── 루트 ─────────────────────────────
export function ConnectWizard({ embedded = false }: { embedded?: boolean } = {}) {
  const [view, setView] = useState<null | "repo" | "cluster">(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const fireToast = (t: ToastData) => {
    setView(null); setToast(t);
    // 실제 완료 시점(진행 스테이지 종료)에 셸 알림으로 연결
    const total = t.stages.reduce((s, x) => s + x.ms, 0) + 600;
    window.setTimeout(() => emitAction({ kind: "connect", title: t.doneTitle, body: `${t.ref} · ${t.doneSub}` }), total);
  };

  return (
    <div className={`opsia-connect ${embedded ? "absolute" : "fixed"} inset-0`}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-28 -top-28 size-[440px] rounded-full" style={{ background: "radial-gradient(circle, rgba(10,132,255,0.13), transparent 70%)", filter: "blur(46px)" }} />
        <div className="absolute -right-20 bottom-0 size-[400px] rounded-full" style={{ background: "radial-gradient(circle, rgba(48,209,88,0.18), transparent 70%)", filter: "blur(46px)" }} />
      </div>

      {view === null && !toast && <Launcher onPick={setView} />}

      <AnimatePresence>
        {view && (
          <>
            <motion.div key="backdrop" className="absolute inset-0" style={{ background: "rgba(0,0,0,0.28)", backdropFilter: "blur(5px)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setView(null)} />
            <div className="absolute inset-0 overflow-y-auto">
              <div className="flex min-h-full justify-center px-6" style={{ paddingTop: "8vh", paddingBottom: "8vh" }}>
                <motion.div key={view} initial={{ opacity: 0, y: 22, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ type: "spring", visualDuration: 0.42, bounce: 0.2 }}
                  style={{ width: 580, maxWidth: "100%", borderRadius: 26, alignSelf: "flex-start", boxShadow: "0 44px 100px -30px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.15)" }} className="modal-surface overflow-hidden">
                  {view === "repo"
                    ? <RepoWizard onClose={() => setView(null)} onToast={fireToast} />
                    : <ClusterWizard onClose={() => setView(null)} onToast={fireToast} />}
                </motion.div>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>{toast && <Toast key="toast" data={toast} onClose={() => setToast(null)} />}</AnimatePresence>

      <style>{`
        .opsia-connect {
          --surface: #FFFFFF;
          --ink: #111318; --ink-2: #6B7280; --ink-3: #9AA1AC;
          --line: rgba(17,19,24,0.07);
          /* 셸 팔레트와 통일: BLUE #0A84FF · HP.ok #30D158 · HP.warn #FFB340 · HP.crit #FF5F55 */
          --blue: #0A84FF; --accent: #0A84FF; --lime: #30D158;
          --green: #30D158; --orange: #FFB340; --red: #FF5F55;
          --soft: rgba(10,132,255,0.06); --soft-b: rgba(10,132,255,0.32);
          --fill: #F2F3F7; --fill-2: #E9EBF1;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif;
          color: var(--ink);
        }
        .c-ink { color: var(--ink); } .c-2 { color: var(--ink-2); } .c-3 { color: var(--ink-3); }
        .c-accent { color: var(--blue); } .c-green { color: var(--green); } .c-orange { color: var(--orange); } .c-red { color: var(--red); }
        .bg-surface { background: var(--surface); } .bg-soft { background: var(--soft); }
        .bg-accent { background: var(--blue); } .bg-green { background: var(--green); } .bg-lime { background: var(--lime); }
        .green-bg { background: rgba(48,209,88,0.14); } .orange-bg { background: rgba(255,179,64,0.16); } .lime-bg { background: var(--lime); }
        .err-bg { background: rgba(255,95,85,0.06); border: 1px solid rgba(255,95,85,0.18); }
        .err-ic-bg { background: rgba(255,95,85,0.14); }
        .dot-r { background: var(--red); } .dot-o { background: var(--orange); } .dot-g { background: var(--green); }
        .ping-g { background: rgba(48,209,88,0.5); }
        .toggle-off { background: rgba(17,19,24,0.14); }
        .hairline { height: 1px; background: var(--line); }
        .hdr-grad { background: var(--blue); }
        /* 머티리얼: 테두리 대신 부드러운 그림자로 깊이 */
        .modal-surface { background: var(--surface); }
        .notif { background: var(--surface); box-shadow: 0 14px 34px -10px rgba(17,19,24,0.24), 0 2px 8px rgba(17,19,24,0.06); }
        .field { background: var(--fill); border: 1px solid transparent; transition: background .18s, border-color .18s, box-shadow .18s; }
        .field:focus-within { background: #fff; border-color: var(--soft-b); box-shadow: 0 0 0 4px rgba(10,132,255,0.12); }
        /* 트레이형 리스트: 회색 트레이 + 선택 시 흰 카드가 떠오름 */
        .inset { background: var(--fill); border-radius: 18px; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
        .inset-row { display: flex; align-items: center; gap: 13px; width: 100%; text-align: left; padding: 11px 13px; border-radius: 13px; transition: background .15s, box-shadow .15s; }
        .inset-row:hover { background: rgba(17,19,24,0.035); }
        .inset-row-on, .inset-row-on:hover { background: #fff; box-shadow: 0 1px 2px rgba(17,19,24,0.06), 0 6px 16px -8px rgba(17,19,24,0.14); }
        .badge { font-size: 10.5px; font-weight: 600; color: var(--ink-2); background: #fff; padding: 3px 9px; border-radius: 999px; box-shadow: 0 1px 2px rgba(17,19,24,0.06); }
        .check-off { border-color: rgba(17,19,24,0.2); background: #fff; }
        .inset-row:hover .check-off { border-color: rgba(17,19,24,0.3); }
        .seg { background: var(--fill); }
        .card { background: var(--fill); border: 1px solid transparent; transition: background .16s, border-color .16s, box-shadow .16s; }
        .card:hover { background: var(--fill-2); }
        .card-on, .card-on:hover { background: #fff; border-color: var(--soft-b); box-shadow: 0 1px 2px rgba(17,19,24,0.06), 0 6px 16px -8px rgba(17,19,24,0.14); }
        .cmd { background: var(--fill); border: none; }
        .stat { display: flex; background: var(--fill); border-radius: 16px; overflow: hidden; }
        .btn-primary { background: var(--blue); color: #fff; box-shadow: 0 8px 18px -8px rgba(10,132,255,0.55); transition: background .16s, transform .12s; }
        .btn-primary:not(:disabled):hover { background: #0973E6; }
        .btn-primary:not(:disabled):active { transform: scale(0.99); }
        .btn-ghost { background: var(--fill); border: none; transition: background .16s; }
        .btn-ghost:hover { background: var(--fill-2); }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:.01ms !important; transition-duration:.01ms !important; } }
      `}</style>
    </div>
  );
}

// 단독 페이지에서만 마운트 — 통합 셸에서는 ConnectWizard를 import해 임베드한다
if (window.location.pathname.includes("devpreview-connect")) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <div className="min-h-screen" style={{ background: "#EEF0F4" }}><ConnectWizard /></div>,
  );
}
