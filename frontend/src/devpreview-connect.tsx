/* eslint-disable react-hooks/exhaustive-deps */
// ⚠ 데모 · 환경 연결 마법사. 런처 → (A)Git 저장소 등록 / (B)클러스터 연결(에이전트 설치).
// UI-PHASE2-001 wiring: 클러스터 연결은 라이브 백엔드(providers 카탈로그/디스커버리,
// preflight/register, connection 상태)에 연결됨. 저장소 흐름은 서버 디스커버리 클라이언트가
// 없어 로컬 주소 검증만 수행하고 나머지는 정직한 미지원(gap) 상태로 표시한다.
// SAFETY(plan §5): 공유 라이브 백엔드. GET 읽기만 마운트 시 자동 실행. 타깃 등록(POST)은
// 사용자의 명시적 클릭에서만 호출하며 타이머/마운트 자동 제출은 없다. 토큰은 저장·로그 금지.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, ChevronRight, Copy, Folder, GitBranch, Globe,
  Info, Lock, Search, Server, Sparkles, X,
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
import { isApiError, type TargetInstallResponse, type TargetPreflightResponse } from "./devpreview/connectFeed";
import {
  PLATFORM_CLOUD_PROVIDER,
  REPOSITORY_DISCOVERY_GAP_REASON,
  preflightClusterTarget,
  registerClusterTarget,
  useClusterConnectionStatus,
  useClusterProviders,
  type ClusterProvidersView,
  type ConnectionStatusView,
  type ProviderAvailability,
} from "./devpreview/connectFeed";
import { reasonLabel, statusLabel } from "./devpreview/statusLabel";
import "./styles/tokens.css";
import "./styles/foundation.css";

const EASE = [0.32, 0.72, 0, 1] as const;
// 로컬 주소 파서 디바운스만 남긴다(서버 호출 아님). 성공을 흉내내는 타이머는 제거됨.
const T = { detectMs: 1000 } as const;
const SPRING = { type: "spring", visualDuration: 0.34, bounce: 0.28 } as const;
const swap = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.3, ease: EASE },
};

const PATH = "deploy/prod";
const REPO_STEPS = ["저장소", "서버 연동"];
const CLUSTER_STEPS = ["정보", "설치", "연결"];
const CLUSTER_ENVS = ["prod", "staging", "dev"];

// 설치 플랫폼 · 라이브 providers 디스커버리의 cloud_provider 로 매핑되어 가용성이 결정된다.
const PLATFORMS = [
  { id: "aws", name: "Amazon EKS", sub: "AWS", color: "#FF9900", icon: IconBrandAws },
  { id: "gcp", name: "Google GKE", sub: "GCP", color: "#4285F4", icon: IconBrandGoogle },
  { id: "azure", name: "Azure AKS", sub: "Azure", color: "#0078D4", icon: IconBrandAzure },
  { id: "docker", name: "Docker / 기존 K8s", sub: "로컬", color: "#2496ED", icon: IconBrandDocker },
] as const;
type PlatformId = (typeof PLATFORMS)[number]["id"];

// Git 저장소 주소 검증 · 아니면 null (로컬 형식 확인 · 서버 확인 아님)
type Repo = { full: string; visibility: "public" | "private"; branch: string };
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
  return { full: `${owner}/${repo}`, visibility: /public|open/i.test(raw) ? "public" : "private", branch: "main" };
}

// ── 오류/취소 헬퍼 ─────────────────────────────
function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}
function errorText(cause: unknown): string {
  if (isApiError(cause)) return cause.detail ?? cause.message;
  return cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다.";
}

// ── 공용 프리미티브 ─────────────────────────────
const Spin = ({ c = "size-4" }: { c?: string }) => <Spinner className={c} decorative />;

function GapBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 orange-bg" style={{ borderRadius: 14, padding: "13px 15px" }}>
      <Info className="mt-0.5 size-[17px] shrink-0 c-orange" />
      <div className="text-[12.5px] leading-[1.55] c-2">{children}</div>
    </div>
  );
}

function ProviderChips({ providers }: { providers: ProviderAvailability[] }) {
  if (providers.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {providers.map((p) => (
        <span key={p.key} title={p.unavailableReason ?? undefined}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold ${p.available ? "green-bg c-green" : "orange-bg c-orange"}`}>
          {p.available ? <Check className="size-3" strokeWidth={2.5} /> : <X className="size-3" strokeWidth={2.5} />}
          {p.label}
        </span>
      ))}
    </div>
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
  <button onClick={onClick} aria-label="뒤로" className="btn-ghost grid shrink-0 place-items-center" style={{ borderRadius: 14, width: 50, height: 50 }}><ArrowLeft className="size-[18px] c-2" /></button>
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
        <button onClick={onClose} aria-label="닫기" className="grid size-9 place-items-center rounded-full c-3 transition-colors hover:bg-soft" style={{ marginTop: -4 }}><X className="size-5" /></button>
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

// ── A. Git 저장소 등록 (로컬 검증 + 서버 디스커버리 미지원 gap) ─────────────────────────────
function RepoStep({ providers, onNext }: { providers: ClusterProvidersView; onNext: (v: string) => void }) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "detecting" | "found" | "error">("idle");
  const [repo, setRepo] = useState<Repo | null>(null);
  const [token, setToken] = useState(""); // 로컬 상태만 · 저장/로그 금지

  const handleInputChange = (v: string) => {
    setInput(v);
    setRepo(null);
    setToken("");
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

  const ready = status === "found" && repo !== null;

  return (
    <motion.div key="repo" {...swap} className="grid gap-5">
      <p className="text-[14px] leading-[1.55] c-2">Git 저장소 주소를 붙여넣으면 <span className="c-ink font-medium">주소 형식</span>을 로컬에서 확인합니다.</p>

      <GapBanner>{REPOSITORY_DISCOVERY_GAP_REASON}</GapBanner>

      {providers.status === "ready" && providers.sourceProviders.length > 0 && (
        <div className="grid gap-2">
          <span className="px-0.5 text-[12px] font-medium c-3">서버 지원 소스 제공자(라이브)</span>
          <ProviderChips providers={providers.sourceProviders} />
        </div>
      )}

      <div className="field flex items-center gap-3 bg-surface" style={{ borderRadius: 14, padding: "15px 16px" }}>
        {status === "detecting" ? <Spin c="size-[18px] c-accent" /> : <Search className="size-[18px] c-3" />}
        <input autoFocus value={input} onChange={(e) => handleInputChange(e.currentTarget.value)} placeholder="https://github.com/org/repo" className="w-full bg-transparent font-mono text-[14px] c-ink outline-none placeholder:font-sans placeholder:c-3" />
      </div>

      <AnimatePresence mode="popLayout">
        {status === "detecting" && (
          <motion.p key="det" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-0.5 text-[13px] c-2"><Spin c="size-3.5 c-accent" /> 주소 형식 확인 중…</motion.p>
        )}
        {status === "error" && (
          <motion.div key="err" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING} className="flex items-center gap-3.5 err-bg" style={{ borderRadius: 16, padding: "15px 18px" }}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full err-ic-bg"><AlertCircle className="size-5 c-red" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold c-ink">주소 형식을 확인할 수 없어요</div>
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
                    ? <span className="inline-flex items-center gap-1 rounded-full orange-bg px-2 py-[3px] text-[11px] font-semibold c-orange"><Lock className="size-3" strokeWidth={2.5} />비공개(추정)</span>
                    : <span className="inline-flex items-center gap-1 rounded-full green-bg px-2 py-[3px] text-[11px] font-semibold c-green"><Globe className="size-3" strokeWidth={2.5} />공개(추정)</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] c-2">
                  <GitBranch className="size-3.5 c-3" /><span className="font-mono">형식만 확인됨</span><span className="c-3">·</span><span>서버 확인 안 됨</span>
                </div>
              </div>
            </div>

            {repo.visibility === "private" && (
              <div className="grid gap-2.5 pt-1">
                <span className="px-0.5 text-[12.5px] font-medium c-2">비공개로 추정돼요 · 토큰은 화면에만 보관되며 저장·전송되지 않습니다</span>
                <div className="field flex items-center gap-3 bg-surface" style={{ borderRadius: 14, padding: "15px 16px" }}>
                  <Lock className="size-[18px] c-3" />
                  <input value={token} onChange={(e) => setToken(e.currentTarget.value)} placeholder="ghp_••••••••••••••••" className="w-full bg-transparent font-mono text-[14px] c-ink outline-none placeholder:c-3" />
                </div>
                <span className="px-0.5 text-[11.5px] c-3">서버 토큰 검증은 미지원이라 여기서 확인할 수 없습니다.</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <NextButton show={ready} label="다음" onClick={() => repo && onNext(repo.full)} />
    </motion.div>
  );
}

function RepoGapStep({ repo, onBack }: { repo: string; onBack: () => void }) {
  return (
    <motion.div key="repogap" {...swap} className="grid gap-5">
      <div className="flex items-center gap-4 bg-soft" style={{ borderRadius: 16, padding: "16px 18px" }}>
        <span className="grid size-11 shrink-0 place-items-center bg-surface" style={{ borderRadius: 13, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}><Folder className="size-[22px] c-2" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold tracking-[-0.015em] c-ink">{repo}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[12.5px] c-2"><Folder className="size-3.5 c-3" /><span className="font-mono">{PATH}</span></div>
        </div>
      </div>

      <div className="flex items-start gap-3.5 err-bg" style={{ borderRadius: 16, padding: "16px 18px" }}>
        <span className="grid size-9 shrink-0 place-items-center rounded-full err-ic-bg"><AlertCircle className="size-5 c-orange" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold c-ink">저장소 서버 연동은 미지원(gap)입니다</div>
          <div className="mt-1 text-[12.5px] leading-[1.55] c-2">
            매니페스트 자동 탐색·브랜치 조회·배포 동기화는 <span className="font-mono">/api/repositories/discovery/*</span> 클라이언트가
            이 빌드에 없어 실제로 수행할 수 없습니다. 관측되지 않은 값을 지어내지 않기 위해 이 단계는 결과를 표시하지 않습니다.
            클러스터 연결 흐름은 라이브로 동작합니다.
          </div>
        </div>
      </div>

      <div className="flex"><BackBtn onClick={onBack} /></div>
    </motion.div>
  );
}

function RepoWizard({ providers, onClose }: { providers: ClusterProvidersView; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [repo, setRepo] = useState("");
  const el = {
    0: <RepoStep key="s0" providers={providers} onNext={(v) => { setRepo(v); setStep(1); }} />,
    1: <RepoGapStep key="s1" repo={repo} onBack={() => setStep(0)} />,
  }[step];
  return (<><ShellHeader icon={GitBranch} title="Git 저장소 연결" sub="주소 형식은 로컬에서 확인 · 서버 디스커버리는 미지원" onClose={onClose} /><Steps steps={REPO_STEPS} active={step} /><Body>{el}</Body></>);
}

// ── B. 클러스터 연결 (에이전트 설치 · 라이브) ─────────────────────────────
function PlatformAvailability({ providers, cloud }: { providers: ClusterProvidersView; cloud: string }) {
  const info = providers.cloudProviders.get(cloud);
  if (providers.status === "loading") return null;
  if (!info || info.available) return null;
  return (
    <span className="text-[10.5px] font-semibold c-orange">
      미지원{info.unavailableReason ? ` · ${info.unavailableReason}` : ""}
    </span>
  );
}

function ClusterInfoStep({
  providers, name, setName, platform, setPlatform, env, setEnv, onNext,
}: {
  providers: ClusterProvidersView;
  name: string;
  setName: (v: string) => void;
  platform: PlatformId;
  setPlatform: (v: PlatformId) => void;
  env: string;
  setEnv: (v: string) => void;
  onNext: () => void;
}) {
  const cloudFor = (id: PlatformId) => PLATFORM_CLOUD_PROVIDER[id] ?? "";
  const isDisabled = (id: PlatformId) => {
    if (providers.status !== "ready") return false;
    const info = providers.cloudProviders.get(cloudFor(id));
    return info ? !info.available : false;
  };
  const selectedDisabled = isDisabled(platform);
  return (
    <motion.div key="cinfo" {...swap} className="grid gap-5">
      {providers.status === "loading" && (
        <p className="flex items-center gap-2 px-0.5 text-[13px] c-2"><Spin c="size-3.5 c-accent" /> 제공자 목록 불러오는 중…</p>
      )}
      {providers.status === "error" && (
        <GapBanner>제공자 목록(catalog/discovery)을 불러오지 못했습니다. 가용성 표시 없이 진행됩니다 · 실제 등록은 서버가 검증합니다.</GapBanner>
      )}
      {providers.status === "unavailable" && (
        <GapBanner>서버가 등록 가능한 클러스터 제공자를 보고하지 않았습니다.</GapBanner>
      )}
      <div className="grid gap-2.5">
        <span className="px-0.5 text-[12.5px] font-semibold c-2">플랫폼</span>
        <div className="grid grid-cols-2 gap-2.5">
          {PLATFORMS.map((p) => {
            const on = platform === p.id; const Icon = p.icon; const disabled = isDisabled(p.id);
            return (
              <button key={p.id} disabled={disabled} onClick={() => setPlatform(p.id)} className={`card flex items-center gap-3 ${on ? "card-on" : ""} ${disabled ? "opacity-45" : ""}`} style={{ borderRadius: 14, padding: "12px 13px" }}>
                <span className="grid shrink-0 place-items-center" style={{ width: 34, height: 34, borderRadius: 10, background: `${p.color}1A` }}><Icon size={21} stroke={2} style={{ color: p.color }} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold tracking-[-0.01em] c-ink">{p.name}</div>
                  <div className="text-[11px] c-3">{p.sub}</div>
                  <PlatformAvailability providers={providers} cloud={cloudFor(p.id)} />
                </div>
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
          <input autoFocus value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="game-server-apne2" className="w-full bg-transparent font-mono text-[14px] c-ink outline-none placeholder:font-sans placeholder:c-3" />
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
      <NextButton show={name.trim().length > 1 && !selectedDisabled}
        label="등록 단계로" onClick={onNext} />
    </motion.div>
  );
}

function PreflightPanel({ result }: { result: TargetPreflightResponse }) {
  const ok = result.valid && result.provider_ready && !result.duplicate_cluster_id;
  return (
    <div className="grid gap-2.5 inset" style={{ padding: 14 }}>
      <div className="flex items-center gap-2">
        <span className={`grid size-6 place-items-center rounded-full ${ok ? "green-bg" : "orange-bg"}`}>
          {ok ? <Check className="size-[15px] c-green" strokeWidth={3} /> : <AlertCircle className="size-[15px] c-orange" />}
        </span>
        <span className="text-[13px] font-semibold c-ink">{ok ? "사전검증 통과" : "사전검증: 확인 필요"}</span>
        <span className="ml-auto font-mono text-[11.5px] c-3">{statusLabel(result.connection_status)}</span>
      </div>
      {result.errors.map((e) => <div key={e} className="text-[11.5px] c-red">· {reasonLabel(e)}</div>)}
      {result.warnings.map((w) => <div key={w} className="text-[11.5px] c-orange">· {reasonLabel(w)}</div>)}
    </div>
  );
}

function ClusterInstallStep({ providers, platform, name, env, providerConfig, onBack, onConnected }: { providers: ClusterProvidersView; platform: PlatformId; name: string; env: string; providerConfig: Record<string, unknown>; onBack: () => void; onConnected: (info: ConnectionStatusView) => void }) {
  const cloud = PLATFORM_CLOUD_PROVIDER[platform] ?? providers.defaultCloudProvider ?? "existing-k8s";
  const deploy = providers.deployProviderFor(cloud) ?? providers.defaultDeployProvider ?? "manual-manifest";
  const fields = { cloudProvider: cloud, deployProvider: deploy, name, environment: env, providerConfig };
  const pf = PLATFORMS.find((p) => p.id === platform)!;
  const Icon = pf.icon;

  const [phase, setPhase] = useState<"idle" | "preflighting" | "preflighted" | "registering" | "registered" | "error">("idle");
  const [preflight, setPreflight] = useState<TargetPreflightResponse | null>(null);
  const [receipt, setReceipt] = useState<TargetInstallResponse | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  // 등록이 실제로 완료된 뒤에만(=cluster_id 존재) 연결 상태를 폴링한다(타이머 성공 흉내 없음).
  const conn = useClusterConnectionStatus(receipt?.cluster_id ?? null);
  useEffect(() => {
    if (conn.connection === "connected") onConnected(conn);
  }, [conn.connection]);

  // 사전검증(비변경 POST) — 명시적 클릭에서만.
  const runPreflight = () => {
    ctrlRef.current?.abort();
    const controller = new AbortController();
    ctrlRef.current = controller;
    setPhase("preflighting"); setErrMsg(null); setPreflight(null);
    void preflightClusterTarget(fields, controller.signal)
      .then((res) => { if (controller.signal.aborted) return; setPreflight(res); setPhase("preflighted"); })
      .catch((cause: unknown) => { if (controller.signal.aborted || isAbortError(cause)) return; setErrMsg(errorText(cause)); setPhase("error"); });
  };

  // 등록(실제 변경 POST) — 사전검증 통과 후 두 번째 명시적 클릭에서만. 토큰은 화면 상태에만 유지.
  const runRegister = () => {
    ctrlRef.current?.abort();
    const controller = new AbortController();
    ctrlRef.current = controller;
    setPhase("registering"); setErrMsg(null);
    void registerClusterTarget(fields, controller.signal)
      .then((res) => { if (controller.signal.aborted) return; setReceipt(res); setPhase("registered"); })
      .catch((cause: unknown) => { if (controller.signal.aborted || isAbortError(cause)) return; setErrMsg(errorText(cause)); setPhase("error"); });
  };

  const cmd = receipt?.install_command ?? "";
  const copy = () => { if (!cmd) return; navigator.clipboard?.writeText(cmd).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
  const canRegister = phase === "preflighted"
    && preflight !== null
    && preflight.valid
    && preflight.provider_ready
    && !preflight.duplicate_cluster_id;

  return (
    <motion.div key="cinstall" {...swap} className="grid gap-5">
      <p className="text-[14px] leading-[1.55] c-2">
        <span className="c-ink font-medium">{cloud}</span> · <span className="font-mono">{deploy}</span> 대상으로 에이전트를 등록합니다.
        등록은 명시적 클릭에서만 실행되며(<span className="font-mono">apply=false</span>, 비파괴적), 설치 명령은 서버가 생성합니다.
        {platform === "aws" && <> AWS CLI 로그인 권한이 있는 터미널에서 생성된 명령을 실행해야 합니다.</>}
      </p>

      {/* 1단계: 사전검증 */}
      {(phase === "idle" || phase === "preflighting" || phase === "error") && !receipt && (
        <button onClick={runPreflight} disabled={phase === "preflighting"} className="btn-primary flex w-full items-center justify-center gap-1.5 text-[15px] font-semibold disabled:opacity-50" style={{ borderRadius: 14, paddingTop: 14, paddingBottom: 14 }}>
          {phase === "preflighting" ? <><Spin c="size-[17px]" /> 사전검증 중…</> : <>사전검증 실행</>}
        </button>
      )}

      {preflight && <PreflightPanel result={preflight} />}

      {/* 2단계: 등록(실제 변경) — 사전검증 통과 후에만 노출 */}
      {(canRegister || phase === "registering") && !receipt && (
        <button onClick={runRegister} disabled={phase === "registering"} className="btn-primary flex w-full items-center justify-center gap-1.5 text-[15px] font-semibold disabled:opacity-50" style={{ borderRadius: 14, paddingTop: 14, paddingBottom: 14 }}>
          {phase === "registering" ? <><Spin c="size-[17px]" /> 등록 중…</> : <>에이전트 등록 · 설치 명령 생성</>}
        </button>
      )}

      {errMsg && (
        <div className="flex items-center gap-3 err-bg" style={{ borderRadius: 14, padding: "13px 15px" }}>
          <AlertCircle className="size-[18px] shrink-0 c-red" />
          <span className="text-[12.5px] c-2">{errMsg}</span>
        </div>
      )}

      {/* 서버 생성 설치 명령 + 부트스트랩 단계 (토큰 포함 · 저장/로그 안 함) */}
      {receipt && (
        <>
          <div className="cmd overflow-hidden" style={{ borderRadius: 16 }}>
            <div className="flex items-center justify-between" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
              <span className="flex items-center gap-2 text-[12px] font-semibold c-2"><Icon size={15} stroke={2} style={{ color: pf.color }} />opsia-agent · {pf.name}</span>
              <button onClick={copy} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors" style={{ color: copied ? "var(--green)" : "var(--ink-2)", background: copied ? "rgba(34,197,94,0.12)" : "rgba(17,19,24,0.05)" }}>
                {copied ? <><Check className="size-3.5" strokeWidth={3} />복사됨</> : <><Copy className="size-3.5" />복사</>}
              </button>
            </div>
            <pre className="overflow-x-auto font-mono text-[12.5px] leading-[1.7] c-ink" style={{ padding: "14px 16px" }}>{cmd}</pre>
          </div>

          {receipt.bootstrap_steps.length > 0 && (
            <div className="inset" style={{ padding: 8 }}>
              {receipt.bootstrap_steps.map((s, i) => (
                <div key={`${i}-${s.label}`} className="inset-row">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-soft text-[11px] font-bold c-accent">{i + 1}</span>
                  <div className="min-w-0 flex-1"><div className="text-[13px] font-medium c-ink">{s.label}</div><div className="mt-0.5 truncate font-mono text-[11px] c-3">{s.command}</div></div>
                </div>
              ))}
            </div>
          )}

          <div className="inset flex items-center gap-3" style={{ padding: "15px 16px" }}>
            {conn.connection === "connected" ? (
              <><span className="grid size-8 shrink-0 place-items-center rounded-full green-bg"><Check className="size-[18px] c-green" strokeWidth={3} /></span><span className="flex-1 text-[13.5px] font-medium c-ink">에이전트 연결됨</span></>
            ) : conn.connection === "expired" ? (
              <><AlertCircle className="size-[18px] shrink-0 c-orange" /><span className="flex-1 text-[13.5px] font-medium c-ink">연결 대기 시간이 만료됐어요</span></>
            ) : conn.status === "error" ? (
              <><AlertCircle className="size-[18px] shrink-0 c-red" /><span className="flex-1 text-[13.5px] font-medium c-ink">연결 상태를 확인하지 못했어요</span></>
            ) : (
              <>
                <span className="relative grid size-8 shrink-0 place-items-center">
                  <span className="absolute inline-flex size-8 animate-ping rounded-full ping-g" />
                  <span className="relative inline-flex size-2.5 rounded-full dot-g" />
                </span>
                <span className="flex-1 text-[13.5px] font-medium c-ink">에이전트 연결을 기다리는 중…</span>
                <Spin c="size-[18px] c-accent" />
              </>
            )}
          </div>
        </>
      )}

      <div className="flex"><BackBtn onClick={onBack} /></div>
    </motion.div>
  );
}

function ClusterDoneStep({ name, env, connection, onDone }: { name: string; env: string; connection: ConnectionStatusView; onDone: () => void }) {
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
        <div className="flex-1 text-center" style={{ padding: "15px 0" }}>
          <div className="text-[15px] font-bold tracking-[-0.01em] c-ink">{connection.agentVersion ?? "—"}</div>
          <div className="mt-0.5 text-[11.5px] font-medium c-3">에이전트 버전</div>
        </div>
        <div className="flex-1 text-center" style={{ padding: "15px 0", borderLeft: "1px solid rgba(17,19,24,0.06)" }}>
          <div className="text-[15px] font-bold tracking-[-0.01em] c-ink">{connection.connectedAt ? new Date(connection.connectedAt).toLocaleTimeString() : "—"}</div>
          <div className="mt-0.5 text-[11.5px] font-medium c-3">연결 시각</div>
        </div>
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

function ClusterWizard({ providers, onClose, onComplete }: { providers: ClusterProvidersView; onClose: () => void; onComplete: (name: string) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("game-server");
  const [platform, setPlatform] = useState<PlatformId>("aws");
  const [env, setEnv] = useState("prod");
  const [connection, setConnection] = useState<ConnectionStatusView | null>(null);
  const el = {
    0: <ClusterInfoStep key="c0" providers={providers} name={name} setName={setName} platform={platform} setPlatform={setPlatform} env={env} setEnv={setEnv}
      onNext={() => setStep(1)} />,
    1: <ClusterInstallStep key="c1" providers={providers} platform={platform} name={name} env={env} providerConfig={{}}
      onBack={() => setStep(0)} onConnected={(info) => { setConnection(info); setStep(2); }} />,
    2: connection ? <ClusterDoneStep key="c2" name={name} env={env} connection={connection} onDone={() => onComplete(name)} /> : null,
  }[step];
  return (<><ShellHeader icon={Server} title="클러스터 연결" sub="에이전트를 설치하면 클러스터가 안전하게 등록·관측됩니다" onClose={onClose} /><Steps steps={CLUSTER_STEPS} active={step} /><Body>{el}</Body></>);
}

// ── 런처 ─────────────────────────────
function Launcher({ onPick }: { onPick: (v: "repo" | "cluster") => void }) {
  const items = [
    { id: "repo" as const, icon: GitBranch, title: "Git 저장소 연결", sub: "레포 주소 형식 확인 · 서버 디스커버리는 미지원" },
    { id: "cluster" as const, icon: Server, title: "클러스터 연결", sub: "에이전트를 설치해 클러스터를 등록·관측 (라이브)" },
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
export function ConnectWizard({ embedded = false, initialView = null, onDismiss }: { embedded?: boolean; initialView?: null | "repo" | "cluster"; onDismiss?: () => void } = {}) {
  const [view, setView] = useState<null | "repo" | "cluster">(initialView);
  const providers = useClusterProviders();
  // 컨텍스트 모달 모드: 뒤로가기가 없는 단일 위저드 진입이므로 닫기는 모달을 닫는다(런처로 돌아가지 않음)
  const closeView = () => { if (onDismiss) onDismiss(); else setView(null); };

  // Esc 키로 마법사 닫기(브라우저 confirm/alert 없이 상태 토글/콜백만).
  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeView(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  // 실제 연결 완료 시점에만 셸 알림으로 연결(관측된 결과 기반 · 타이머 흉내 없음).
  const completeCluster = (name: string) => {
    emitAction({ kind: "connect", title: "클러스터 연결됨", body: `${name} · 메트릭 수집 시작`, scope: "cluster", ref: name });
    closeView();
  };

  return (
    <div className={`opsia-connect ${embedded ? "absolute" : "fixed"} inset-0`}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-28 -top-28 size-[440px] rounded-full" style={{ background: "radial-gradient(circle, rgba(10,132,255,0.13), transparent 70%)", filter: "blur(46px)" }} />
        <div className="absolute -right-20 bottom-0 size-[400px] rounded-full" style={{ background: "radial-gradient(circle, rgba(48,209,88,0.18), transparent 70%)", filter: "blur(46px)" }} />
      </div>

      {view === null && <Launcher onPick={setView} />}

      <AnimatePresence>
        {view && (
          <>
            <motion.div key="backdrop" className="absolute inset-0" style={{ background: "rgba(0,0,0,0.28)", backdropFilter: "blur(5px)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeView} />
            {/* 바깥(배경) 클릭 시 닫기 · 모달 컨텐츠 클릭은 stopPropagation으로 전파 차단 */}
            <div className="absolute inset-0 overflow-y-auto" onClick={closeView}>
              <div className="flex min-h-full justify-center px-6" style={{ paddingTop: "6vh", paddingBottom: "6vh" }}>
                <motion.div key={view} onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 22, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ type: "spring", visualDuration: 0.42, bounce: 0.2 }}
                  style={{ width: 580, maxWidth: "100%", borderRadius: 26, alignSelf: "flex-start", boxShadow: "0 44px 100px -30px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.15)" }} className="modal-surface overflow-hidden">
                  {view === "repo"
                    ? <RepoWizard providers={providers} onClose={closeView} />
                    : <ClusterWizard providers={providers} onClose={closeView} onComplete={completeCluster} />}
                </motion.div>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>

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
