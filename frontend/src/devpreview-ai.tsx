/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
// ⚠ VP-021 사용성 프리뷰 (더미 · 자가 스트리밍 재생). 배선 완료 시 삭제.
import ReactDOM from "react-dom/client";
import {
  Activity, ArrowUpRight, BellPlus, Boxes, Check, ChevronDown, CircleAlert,
  FileText, GitBranch, Play, Plus, Send, Server, Sparkles, SquarePen, X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import "./styles/tokens.css";
import "./styles/foundation.css";
import { Spinner } from "./shared/ui/primitives/spinner";
import { emitAction } from "./devpreview/bus";
import {
  DUMMY_CONVERSATION, DUMMY_CONVERSATION_LIST, DUMMY_SUGGESTIONS,
} from "./features/ai-assistant/aiConversationPreviewData";
import type {
  AiMessagePart, AiPageLink, AiResultPart, AiStepsPart, AiTextPart, AiTone, AiTurn,
} from "./features/ai-assistant/aiConversationContract";

const SPRING = "cubic-bezier(0.22, 1, 0.36, 1)"; // 진입 등장 이징

// ── 타이밍 상수 (한 곳에서 관리) ─────────────────────────────
// collapse* 는 CSS 트랜지션과 공유(스타일 블록에 주입). 재생/타이핑 계열은 프리뷰 전용(배선 시 제거).
const TIMING = {
  autoCollapseMs: 2800,    // 답변 완료 후 자동 접힘까지
  collapseSlideMs: 300,    // 접힘/펼침 높이 트랜지션
  collapseFadeMs: 150,     // 내용↔요약 크로스페이드
  typewriterStepMs: 11,    // 타이핑 간격
  stepRevealMs: 560,       // 단계 노출 간격
  stepCollapseMs: 900,     // 단계 완료 후 한 줄 접힘
  partReadyMs: 440,        // 비텍스트 파트 준비 지연
  revealGapMs: 520,        // 유저 발화 후 다음 노출 간격
  thinkMs: 650,            // 답변 전 "생각 중"
  sendThinkMs: 800,        // 전송 후 응답까지
  actionCreateMs: 900,     // 알림 생성 처리
  actionCollapseMs: 1100,  // 생성 후 한 줄 접힘
  userShownMs: 480,        // 유저 말풍선 노출
  collapsedShownMs: 260,   // 접힌 요약 노출
  replayStep1Ms: 450, replayStep2Ms: 980, // ▶ 재생 시 초기 노출
} as const;

// ── 색상: 애플 팔레트는 CSS 변수(.opsia-ai)로 정의, 여기선 토큰만 참조 ──
const toneHex: Record<AiTone, string> = {
  healthy: "var(--ap-green)", warning: "var(--ap-orange)", critical: "var(--ap-red)", neutral: "var(--ap-gray)",
};
const ICON = 1.75; // SF Symbols 느낌의 일관된 스트로크
const linkIcon = (i?: AiPageLink["icon"]) => i === "resources" ? Boxes : i === "incident" ? CircleAlert : i === "gitops" ? GitBranch : i === "cluster" ? Server : i === "alert" ? BellPlus : ArrowUpRight;
const evIcon = (t: string) => t === "event" ? CircleAlert : t === "metric" ? Activity : FileText;
const LINK = "ap-link"; // 스타일은 .ap-link (스타일 블록)
const md = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" class="${LINK}">$1</a>`).replace(/\n/g, "<br/>");

// ── 파트 렌더러 (단일 표면 안에서 flat) ─────────────────────────────

function TextPart({ part, active, onReady }: { part: AiTextPart; active: boolean; onReady: () => void }) {
  const [n, setN] = useState(active ? 0 : part.markdown.length);
  useEffect(() => {
    if (!active) { setN(part.markdown.length); return; }
    if (!part.markdown) { onReady(); return; }
    setN(0); let i = 0;
    const id = window.setInterval(() => { i += 2; setN(i); if (i >= part.markdown.length) { window.clearInterval(id); onReady(); } }, TIMING.typewriterStepMs);
    return () => window.clearInterval(id);
  }, [active]);
  if (!part.markdown) return null;
  // 타이핑 중 미완성 마크다운 토큰(링크/코드/볼드)을 숨겨 원문 기호 노출 방지
  let safe = part.markdown.slice(0, n).replace(/\[[^\]]*(\]\([^)]*)?$/, "");
  if (((safe.match(/`/g) || []).length) % 2) safe = safe.replace(/`([^`]*)$/, "$1");
  if (((safe.match(/\*\*/g) || []).length) % 2) safe = safe.replace(/\*\*([^*]*)$/, "$1");
  return (
    <p className="text-[13.5px] leading-[1.7] tracking-[-0.006em] text-foreground/90 [&_code]:rounded-md [&_code]:bg-muted/70 [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.82em] [&_strong]:font-semibold [&_strong]:text-foreground">
      <span dangerouslySetInnerHTML={{ __html: md(safe) }} />
      {active && n < part.markdown.length ? <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse rounded-full bg-primary align-text-bottom" /> : null}
    </p>
  );
}

function StepsPart({ part, active, onReady, evidenceCount }: { part: AiStepsPart; active: boolean; onReady: () => void; evidenceCount: number }) {
  const total = part.steps.length;
  const [done, setDone] = useState(active ? 0 : total);
  const [collapsed, setCollapsed] = useState(!active && !part.running);
  useEffect(() => {
    if (!active) { setDone(total); return; }
    setDone(0); let d = 0;
    const id = window.setInterval(() => {
      d += 1; setDone(d);
      const finished = part.running ? d >= total - 1 : d >= total;
      if (finished) { window.clearInterval(id); if (!part.running) { onReady(); window.setTimeout(() => setCollapsed(true), TIMING.stepCollapseMs); } }
    }, TIMING.stepRevealMs);
    return () => window.clearInterval(id);
  }, [active]);
  const complete = !part.running && done >= total;

  if (collapsed && complete) {
    return (
      <button onClick={() => setCollapsed(false)} type="button"
        className="group/s flex w-fit items-center gap-1.5 rounded-full text-[11.5px] font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
        style={{ animation: `fadeUp 0.4s ${SPRING}` }}>
        <span className="grid size-4 place-items-center rounded-full ap-ok-bg"><Check className="size-2.5 ap-ok" /></span>
        <span>근거 {total}단계 확인{evidenceCount ? ` · ${evidenceCount}건` : ""}</span>
        <ChevronDown className="size-3 opacity-0 transition-opacity group-hover/s:opacity-50" />
      </button>
    );
  }
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
        {complete ? <Check className="size-3.5 ap-ok" /> : <Spinner className="size-3.5 ap-accent" decorative />}
        <span className="tracking-[-0.01em]">{complete ? "근거 확인 완료" : "확인하는 중"}</span>
        <span className="tabular-nums opacity-60">{Math.min(done + (part.running ? 1 : 0), total)}/{total}</span>
      </div>
      <ol className="ml-[6px] grid gap-2 border-l border-border/70 pl-4">
        {part.steps.map((s, i) => {
          const isDone = i < done;
          const isRunning = i === done && (part.running || done < total);
          if (!isDone && !isRunning) return null;
          return (
            <li key={s.id} className="relative flex items-center gap-2 text-[12.5px]" style={{ animation: `stepIn 0.42s ${SPRING}` }}>
              <span className="absolute -left-[21px] grid size-4 place-items-center rounded-full bg-card ring-4 ring-card">
                {isDone ? <span className="grid size-4 place-items-center rounded-full ap-ok-bg"><Check className="size-2.5 ap-ok" /></span> : <Spinner className="size-3 ap-accent" decorative />}
              </span>
              <span className="font-medium text-foreground/90">{s.label}</span>
              {isDone && s.detail ? <span className="truncate text-muted-foreground/80">· {s.detail}</span> : isRunning ? <span className="text-muted-foreground/70">…</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** 애플 헬스풍 지표 행 — hairline 위에 큰 숫자. (중첩 카드 아님) */
function ResultPart({ part, first }: { part: AiResultPart; first?: boolean }) {
  return (
    <div className={`grid gap-2.5 ${first ? "" : "border-t border-black/[0.05] pt-3"}`} style={{ animation: `fadeUp 0.5s ${SPRING}` }}>
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full" style={{ background: toneHex[part.tone] }} />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">{part.title}</span>
        <span className="text-[12px] text-muted-foreground">· {part.summary}</span>
      </div>
      {part.metrics ? (
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {part.metrics.map((m) => (
            <div className="grid gap-0.5" key={m.label}>
              <span className="text-[19px] font-semibold leading-none tracking-[-0.02em] tabular-nums" style={{ color: toneHex[m.tone] }}>{m.value}</span>
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground/70">{m.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EvidencePart({ part }: { part: Extract<AiMessagePart, { kind: "evidence" }> }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px]" style={{ animation: `fadeUp 0.45s ${SPRING}` }}>
      <span className="font-medium text-muted-foreground/70">근거</span>
      {part.items.map((e) => { const Icon = evIcon(e.type); return (
        <a href="#" key={e.id} className={`inline-flex items-center gap-1 ${LINK}`}><Icon className="size-3 opacity-60" />{e.label}</a>
      ); })}
    </p>
  );
}

function LinksPart({ part }: { part: Extract<AiMessagePart, { kind: "links" }> }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]" style={{ animation: `fadeUp 0.5s ${SPRING}` }}>
      {part.items.map((l) => { const Icon = linkIcon(l.icon); return (
        <a href="#" key={l.href} className={`inline-flex items-center gap-1 ${LINK}`}><Icon className="size-3.5 opacity-60" />{l.label}<ArrowUpRight className="size-3 opacity-50" /></a>
      ); })}
    </p>
  );
}

/** 표면 안에서 flat한 대화형 폼(자체 카드 없음 → 카드 중첩 제거). 완료 시 한 줄로 접힘. */
function ActionPart({ part, onIdleChange, first }: { part: Extract<AiMessagePart, { kind: "action" }>; onIdleChange?: (idle: boolean) => void; first?: boolean }) {
  const p = part.proposal.payload;
  const [state, setState] = useState<"idle" | "creating" | "created">("idle");
  const [collapsed, setCollapsed] = useState(false);
  const created = state === "created";
  useEffect(() => { onIdleChange?.(state === "idle"); }, [state]);
  useEffect(() => { if (created) { const id = window.setTimeout(() => setCollapsed(true), TIMING.actionCollapseMs); return () => window.clearTimeout(id); } }, [created]);

  if (created && collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} type="button"
        className="flex w-fit items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
        style={{ animation: `fadeUp 0.4s ${SPRING}` }}>
        <span className="grid size-4 place-items-center rounded-full ap-ok-bg"><Check className="size-2.5 ap-ok" /></span>
        <span className="font-medium text-foreground/90">{p.name}</span><span>생성됨</span>
        <span className="mx-0.5 text-muted-foreground/40">·</span>
        <a href="#" className={LINK} onClick={(e) => e.stopPropagation()}>규칙 보기</a>
      </button>
    );
  }
  return (
    <div className={`grid gap-2.5 ${first ? "" : "border-t border-black/[0.05] pt-3"}`} style={{ animation: `fadeUp 0.5s ${SPRING}` }}>
      <div className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em]">
        <span className={`grid size-5 place-items-center rounded-md ${created ? "ap-ok-bg ap-ok" : "bg-black/[0.05] text-foreground/70"}`}>
          {created ? <Check className="size-3" strokeWidth={ICON} /> : <BellPlus className="size-3" strokeWidth={ICON} />}
        </span>
        {created ? "알림 규칙 생성됨" : "알림 규칙 만들기"}
      </div>
      <dl className={`grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[12px] transition-opacity ${created ? "opacity-55" : ""}`}>
        <dt className="text-muted-foreground/80">이름</dt><dd className="font-medium">{p.name}</dd>
        <dt className="text-muted-foreground/80">조건</dt><dd className="font-medium tabular-nums">CPU {p.comparator} {p.threshold}%</dd>
        <dt className="text-muted-foreground/80">지속</dt><dd className="font-medium tabular-nums">{p.forSeconds}초 이상</dd>
        <dt className="text-muted-foreground/80">범위</dt><dd className="font-medium">{p.scope.clusters.join(", ") || "현재 화면"}</dd>
      </dl>
      {!created ? (
        <div className="flex items-center gap-2 pt-0.5">
          <button type="button" disabled={state === "creating"} onClick={() => { setState("creating"); setTimeout(() => { setState("created"); emitAction({ kind: "alert_rule", title: "알림 규칙 생성됨", body: `${p.name} · CPU ${p.comparator} ${p.threshold}% · ${p.forSeconds}초` }); }, TIMING.actionCreateMs); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all hover:brightness-105 active:scale-[0.97] disabled:opacity-60">
            {state === "creating" ? <Spinner className="size-4" decorative /> : <BellPlus className="size-4" />}
            {state === "creating" ? "만드는 중" : "만들기"}
          </button>
          <button type="button" className="rounded-xl px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground">수정</button>
        </div>
      ) : null}
    </div>
  );
}

function PartView({ part, active, onReady, evidenceCount, onIdleChange, first }: { part: AiMessagePart; active: boolean; onReady: () => void; evidenceCount: number; onIdleChange?: (idle: boolean) => void; first?: boolean }) {
  const fired = useRef(false);
  const ready = () => { if (!fired.current) { fired.current = true; onReady(); } };
  useEffect(() => { fired.current = false; }, [active]);
  useEffect(() => {
    if (active && !(part.kind === "text" || part.kind === "steps")) {
      const id = window.setTimeout(ready, TIMING.partReadyMs); return () => window.clearTimeout(id);
    }
  }, [active]);
  if (part.kind === "text") return <TextPart active={active} onReady={ready} part={part} />;
  if (part.kind === "steps") return <StepsPart active={active} evidenceCount={evidenceCount} onReady={ready} part={part} />;
  if (part.kind === "result") return <ResultPart first={first} part={part} />;
  if (part.kind === "evidence") return <EvidencePart part={part} />;
  if (part.kind === "links") return <LinksPart part={part} />;
  if (part.kind === "action") return <ActionPart first={first} onIdleChange={onIdleChange} part={part} />;
  if (part.kind === "status" && part.state === "pending")
    return <span className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-muted-foreground"><Spinner className="size-3.5 ap-accent" decorative /> 확인하고 있습니다…</span>;
  return null;
}

function deriveSummary(turn: AiTurn): { text: string; tone: AiTone } {
  const parts = turn.parts ?? [];
  const r = parts.find((p) => p.kind === "result") as AiResultPart | undefined;
  if (r) return { text: `${r.title} · ${r.summary}`, tone: r.tone };
  const a = parts.find((p) => p.kind === "action") as Extract<AiMessagePart, { kind: "action" }> | undefined;
  if (a) return { text: `알림 규칙 · ${a.proposal.payload.name}`, tone: "warning" };
  const t = parts.find((p) => p.kind === "text" && (p as AiTextPart).markdown) as AiTextPart | undefined;
  if (t) { const plain = t.markdown.replace(/[`*]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); return { text: plain.length > 44 ? plain.slice(0, 44) + "…" : plain, tone: "neutral" }; }
  return { text: turn.summary ?? "대화", tone: "neutral" };
}

/** 접힘/펼침 — CSS grid-template-rows(0fr↔1fr)로 height:auto를 트랜지션. React는 is-collapsed 클래스만 토글(측정·JS조작 없음). */
function AssistantTurn({ turn, onComplete }: { turn: AiTurn; onComplete: () => void }) {
  const parts = turn.parts ?? [];
  const evidenceCount = (parts.find((p) => p.kind === "evidence") as { items?: unknown[] } | undefined)?.items?.length ?? 0;
  const hasRunning = parts.some((p) => (p.kind === "steps" && p.running) || (p.kind === "status" && p.state === "pending"));
  const [shown, setShown] = useState(1);
  const [phase, setPhase] = useState<"play" | "review">("play");
  const [collapsed, setCollapsed] = useState(false);
  const [actionIdle, setActionIdle] = useState(parts.some((p) => p.kind === "action"));
  const summary = deriveSummary(turn);
  const didAuto = useRef(false);

  const advance = () => setShown((s) => {
    if (s >= parts.length) { setPhase("review"); onComplete(); return s; }
    return s + 1;
  });
  useEffect(() => { if (parts.length === 0) { setPhase("review"); onComplete(); } }, []);

  const instant = phase === "review";
  const canCollapse = instant && !hasRunning && !actionIdle;
  const clickable = collapsed || canCollapse;

  const onSurfaceClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button,input,textarea,select,label")) return;
    if (collapsed) setCollapsed(false);
    else if (canCollapse) setCollapsed(true);
  };

  // 자동 접힘: 완료 후 1회
  useEffect(() => {
    if (didAuto.current || !canCollapse || collapsed) return;
    const id = window.setTimeout(() => { didAuto.current = true; setCollapsed(true); }, TIMING.autoCollapseMs);
    return () => window.clearTimeout(id);
  }, [canCollapse, collapsed]);

  return (
    <div onClick={onSurfaceClick}
      className={`group/msg mr-auto w-full max-w-[97%] overflow-hidden border border-black/[0.04] bg-card shadow-[0_2px_10px_-4px_rgba(0,0,0,0.06),0_18px_44px_-22px_rgba(0,0,0,0.2)] animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ${collapsed ? "is-collapsed" : ""} ${clickable ? "cursor-pointer" : ""}`}
      style={{ borderRadius: 20 }}>
      {/* 접힌 요약 */}
      <div className="ac-cap">
        <div className="min-h-0 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <span className={`size-2 shrink-0 rounded-full ${summary.tone === "critical" ? "island-pulse" : ""}`} style={{ background: toneHex[summary.tone] }} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-muted-foreground group-hover/msg:text-foreground/80">{summary.text}</span>
            <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground/40" />
          </div>
        </div>
      </div>
      {/* 펼친 내용 */}
      <div className="ac-full">
        <div className="min-h-0 overflow-hidden">
          <div className="grid gap-3.5 px-4 py-4">
            {(instant ? parts : parts.slice(0, shown)).map((part, i) => (
              <PartView active={!instant && i === shown - 1} evidenceCount={evidenceCount} first={i === 0} key={i}
                onIdleChange={setActionIdle} onReady={!instant && i === shown - 1 ? advance : () => {}} part={part} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="mr-auto flex w-fit items-center gap-1.5 rounded-full bg-card/70 px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur" style={{ animation: `surfaceIn 0.35s ${SPRING}` }}>
      {[0, 1, 2].map((i) => <span className="size-[7px] rounded-full bg-primary/50" key={i} style={{ animation: `bob 1.1s ${i * 0.15}s infinite ${SPRING}` }} />)}
    </div>
  );
}

function UserTurn({ turn, onShown }: { turn: AiTurn; onShown: () => void }) {
  useEffect(() => { const id = window.setTimeout(onShown, TIMING.userShownMs); return () => window.clearTimeout(id); }, []);
  return <p className="ml-auto w-fit max-w-[80%] rounded-[18px] rounded-br-md bg-primary px-3.5 py-2 text-[13.5px] font-medium leading-relaxed tracking-[-0.006em] text-primary-foreground shadow-[0_2px_8px_-2px_color-mix(in_oklch,var(--primary)_50%,transparent)]" style={{ animation: `userIn 0.42s ${SPRING}` }}>{turn.question}</p>;
}

function CollapsedTurn({ turn, onShown }: { turn: AiTurn; onShown: () => void }) {
  useEffect(() => { const id = window.setTimeout(onShown, TIMING.collapsedShownMs); return () => window.clearTimeout(id); }, []);
  return (
    <div className="group mr-auto flex w-full items-center gap-2.5 rounded-full border border-black/[0.06] bg-card/85 px-3.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_10px_24px_-16px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-[transform,box-shadow] duration-300 hover:-translate-y-px" style={{ animation: `islandIn 0.5s ${SPRING}` }}>
      <span className="size-2 shrink-0 rounded-full island-pulse" style={{ background: toneHex.critical }} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-muted-foreground">{turn.summary}</span>
      <ChevronDown className="size-3.5 shrink-0 -rotate-90 text-muted-foreground/40" />
    </div>
  );
}

const now = () => new Date().toISOString();
function scriptedReply(id: string, q: string): AiTurn {
  const base = { id, role: "assistant" as const, collapsed: false, createdAt: now() };
  if (/알람|알림|alert|걸어/.test(q)) {
    return { ...base, parts: [
      { kind: "action", proposal: { type: "create_alert_rule", rationale: "현재 화면 필터에서 CPU가 70%를 20초 이상 넘으면 알리도록 제안했습니다.", payload: { name: "파드 CPU 70% 알림", metric: "cpu_pct", comparator: ">", threshold: 70, forSeconds: 20, severity: "high", scope: { clusters: ["prod-eks"], namespaces: [], applications: [], labels: [] }, channels: [], enabled: true } } },
    ] };
  }
  if (/위험|상태|어때|health|문제|이상/.test(q)) {
    return { ...base, parts: [
      { kind: "steps", running: false, steps: [
        { id: id + "a", label: "리소스 조회", detail: "42건 · 파드 37", state: "done" },
        { id: id + "b", label: "상태 평가", detail: "위험 1 · 경고 2", state: "done" },
      ] },
      { kind: "result", title: "위험 1 · 경고 2", tone: "warning", summary: "checkout 메모리 초과가 시급", metrics: [
        { label: "위험", value: "1", tone: "critical" }, { label: "경고", value: "2", tone: "warning" }, { label: "정상", value: "34", tone: "healthy" },
      ] },
      { kind: "links", items: [{ label: "위험 리소스 열기", href: "/resources?health=critical", icon: "resources" }] },
    ] };
  }
  return { ...base, parts: [
    { kind: "steps", running: false, steps: [
      { id: id + "a", label: "리소스 조회", detail: "6건 확인", state: "done" },
      { id: id + "b", label: "로그 확인", detail: "관련 이벤트 3건", state: "done" },
    ] },
    { kind: "evidence", items: [
      { type: "event", id: id + "e", label: "최근 변경 3건", link: "/resources" },
      { type: "log", id: id + "l", label: "관련 로그", link: "/resources" },
    ] },
  ] };
}

export function AiPanel({ onClose, embedded = false, contextView = "resources", contextScope = "prod-eks" }: {
  /** 셸 임베드: 닫기 버튼 동작 */
  onClose?: () => void;
  /** 셸 임베드: 고정 460px 대신 컨테이너 폭을 따른다 (리사이즈 핸들 대응) */
  embedded?: boolean;
  /** 현재 화면 맥락 칩 — 셸이 실제 화면·범위를 알려준다 */
  contextView?: string;
  contextScope?: string;
} = {}) {
  const [turns, setTurns] = useState<AiTurn[]>(DUMMY_CONVERSATION.turns);
  const [count, setCount] = useState(1);
  const [thinking, setThinking] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [input, setInput] = useState("");
  const [runId, setRunId] = useState(0);
  const turnsRef = useRef<AiTurn[]>(DUMMY_CONVERSATION.turns);
  const idSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useLayoutEffect(() => {
    const el = scrollRef.current; if (!el) return;
    // 사용자가 이미 바닥 근처일 때만 따라감 (위로 스크롤해 읽는 중엔 끌어내리지 않음)
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 140) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  });

  const reveal = () => setCount((c) => {
    const t = turnsRef.current;
    const next = c + 1; if (next > t.length) return c;
    if (t[next - 1].role === "user") window.setTimeout(reveal, TIMING.revealGapMs);
    return next;
  });
  const afterAssistant = () => { if (count < turnsRef.current.length) { setThinking(true); window.setTimeout(() => { setThinking(false); reveal(); }, TIMING.thinkMs); } };

  const send = (text: string) => {
    const t = text.trim(); if (!t) return;
    setInput("");
    idSeq.current += 1;
    const withUser = [...turnsRef.current, { id: `u${idSeq.current}`, role: "user" as const, question: t, collapsed: false, createdAt: now() }];
    turnsRef.current = withUser; setTurns(withUser); setCount(withUser.length);
    setThinking(true);
    window.setTimeout(() => {
      setThinking(false); idSeq.current += 1;
      const withA = [...turnsRef.current, scriptedReply(`a${idSeq.current}`, t)];
      turnsRef.current = withA; setTurns(withA); setCount(withA.length);
    }, TIMING.sendThinkMs);
  };

  useEffect(() => {
    setTurns(DUMMY_CONVERSATION.turns); turnsRef.current = DUMMY_CONVERSATION.turns;
    setCount(1);
    const a = window.setTimeout(() => setCount(2), TIMING.replayStep1Ms);
    const b = window.setTimeout(() => setCount(3), TIMING.replayStep2Ms);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [runId]);

  return (
    <div className={`opsia-ai relative flex ${embedded ? "h-full w-full min-w-0" : "h-screen w-[460px]"} flex-col overflow-hidden border-l border-black/[0.06] bg-gradient-to-b from-[oklch(0.99_0.002_255)] to-[oklch(0.97_0.003_255)] shadow-2xl`} key={runId}>
      <header className="flex items-center gap-2.5 border-b border-black/[0.05] bg-white/60 px-3.5 py-3 backdrop-blur-xl">
        <span className="grid size-9 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary)_75%,black)] text-primary-foreground shadow-[0_2px_8px_-2px_color-mix(in_oklch,var(--primary)_55%,transparent)]"><Sparkles className="size-4" /></span>
        <div className="min-w-0 flex-1"><h2 className="text-[14px] font-semibold leading-tight tracking-[-0.01em]">Opsia AI</h2><p className="truncate text-[11.5px] text-muted-foreground">현재 화면 맥락으로 질문하고 근거를 확인합니다</p></div>
        {[{ i: Play, t: "재생", a: () => setRunId((r) => r + 1) }, { i: SquarePen, t: "대화 목록", a: () => setListOpen((v) => !v) }, { i: Plus, t: "새 대화", a: undefined }, { i: X, t: "닫기", a: onClose }].map(({ i: Ico, t, a }) => (
          <button className="grid size-8 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-black/[0.05] hover:text-foreground" key={t} onClick={a} title={t} type="button"><Ico className="size-[17px]" /></button>
        ))}
      </header>
      <div className="flex items-center gap-1.5 border-b border-black/[0.04] bg-white/30 px-3.5 py-2 backdrop-blur">
        <span className="text-[11px] font-medium text-muted-foreground/80">맥락</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium"><Boxes className="size-3" />{contextView}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium"><Server className="size-3" />{contextScope}</span>
      </div>
      {listOpen ? (
        <div className="absolute inset-x-0 top-[97px] z-10 border-b border-black/[0.06] bg-white/90 shadow-xl backdrop-blur-xl" style={{ animation: `fadeUp 0.2s ${SPRING}` }}>
          <ul className="grid gap-0.5 p-2">{DUMMY_CONVERSATION_LIST.map((c) => (
            <li key={c.id}><button className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-black/[0.04]" type="button"><Sparkles className="size-3.5 shrink-0 text-muted-foreground" /><span className="flex-1 truncate">{c.title}</span><span className="shrink-0 text-[11.5px] text-muted-foreground">{c.updatedAt}</span></button></li>
          ))}</ul>
        </div>
      ) : null}

      <div className="chatscroll flex-1 space-y-3.5 overflow-y-auto scroll-smooth px-4 py-5 [scrollbar-gutter:stable]" ref={scrollRef}>
        {turns.slice(0, count).map((turn) => {
          if (turn.role === "user") return <UserTurn key={turn.id} onShown={reveal} turn={turn} />;
          if (turn.collapsed) return <CollapsedTurn key={turn.id} onShown={reveal} turn={turn} />;
          return <AssistantTurn key={turn.id} onComplete={afterAssistant} turn={turn} />;
        })}
        {thinking ? <Thinking /> : null}
      </div>

      <div className="border-t border-black/[0.05] bg-white/50 px-3.5 pb-3.5 pt-3 backdrop-blur-xl">
        <div className="mb-2.5 flex flex-wrap gap-1.5">{DUMMY_SUGGESTIONS.map((s) => <button className="rounded-full border border-black/[0.07] bg-white/80 px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-px hover:border-black/[0.12] hover:text-foreground hover:shadow-[0_2px_6px_-2px_rgba(0,0,0,0.12)]" key={s} onClick={() => send(s)} type="button">{s}</button>)}</div>
        <div className="relative rounded-[20px] border border-black/[0.08] bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)] transition-all focus-within:border-primary/40 focus-within:shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_12%,transparent)]">
          <textarea
            className="min-h-[60px] w-full resize-none rounded-[20px] bg-transparent px-3.5 py-3 pr-12 text-[13.5px] leading-relaxed tracking-[-0.006em] outline-none placeholder:text-muted-foreground/60"
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
            placeholder="지금 보고 있는 것에 대해 질문하세요…"
            value={input}
          />
          <button className="absolute bottom-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_6px_-1px_color-mix(in_oklch,var(--primary)_50%,transparent)] transition-all hover:brightness-105 active:scale-90 disabled:scale-90 disabled:opacity-40" disabled={!input.trim()} onClick={() => send(input)} title="보내기" type="button"><Send className="size-4" /></button>
        </div>
      </div>

      <style>{`
        @keyframes surfaceIn { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: none; } }
        @keyframes userIn { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes stepIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
        @keyframes collapseIn { from { opacity: 0; transform: translateY(-4px) scale(0.99); } to { opacity: 1; transform: none; } }
        @keyframes bob { 0%, 100% { transform: translateY(0); opacity: 0.5; } 50% { transform: translateY(-4px); opacity: 1; } }
        @keyframes islandIn { from { opacity: 0; transform: translateY(-6px) scale(0.94); } to { opacity: 1; transform: none; } }
        .chatscroll { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.16) transparent; }
        .chatscroll::-webkit-scrollbar { width: 10px; }
        .chatscroll::-webkit-scrollbar-track { background: transparent; }
        .chatscroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.14); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
        .chatscroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.24); background-clip: padding-box; }
        /* 애플 팔레트 토큰 + 유틸 */
        /* 셸 팔레트와 통일 (BLUE·HP.ok·HP.warn·HP.crit)
           — 제품 토큰의 --primary(검정)를 패널 스코프에서 셸 블루로 오버라이드 */
        .opsia-ai { --ap-blue:#0A84FF; --ap-red:#FF5F55; --ap-orange:#FFB340; --ap-green:#30D158; --ap-gray:#8E8E93;
          --primary:#0A84FF; --primary-foreground:#FFFFFF; --destructive:#FF5F55; }
        .ap-accent { color: var(--ap-blue); }
        .ap-ok { color: var(--ap-green); }
        .ap-ok-bg { background: color-mix(in srgb, var(--ap-green) 15%, transparent); }
        .ap-link { font-weight: 500; color: var(--ap-blue); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: color-mix(in srgb, var(--ap-blue) 30%, transparent); transition: color .15s, text-decoration-color .15s; }
        .ap-link:hover { color: color-mix(in srgb, var(--ap-blue) 82%, black); text-decoration-color: var(--ap-blue); }
        /* 접힘/펼침 아코디언 (grid-rows 0fr↔1fr, 타이밍은 TIMING 주입) */
        .ac-cap, .ac-full { display: grid; }
        .ac-cap { grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows ${TIMING.collapseSlideMs}ms cubic-bezier(0.4,0,0.2,1), opacity ${TIMING.collapseFadeMs}ms ease; }
        .ac-full { grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows ${TIMING.collapseSlideMs}ms cubic-bezier(0.4,0,0.2,1), opacity ${TIMING.collapseFadeMs}ms ease ${TIMING.collapseFadeMs}ms; }
        .is-collapsed .ac-cap { grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows ${TIMING.collapseSlideMs}ms cubic-bezier(0.4,0,0.2,1), opacity ${TIMING.collapseFadeMs}ms ease ${TIMING.collapseFadeMs}ms; }
        .is-collapsed .ac-full { grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows ${TIMING.collapseSlideMs}ms cubic-bezier(0.4,0,0.2,1), opacity ${TIMING.collapseFadeMs}ms ease; }
        .island-pulse { animation: islandPulse 2s ease-in-out infinite; }
        @keyframes islandPulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--destructive) 45%, transparent); } 50% { box-shadow: 0 0 0 4px color-mix(in oklch, var(--destructive) 0%, transparent); } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }
      `}</style>
    </div>
  );
}

// 단독 페이지에서만 마운트 — 통합 셸에서는 AiPanel을 import해 도킹한다
if (window.location.pathname.includes("devpreview-ai")) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <div className="flex min-h-screen justify-end bg-[oklch(0.955_0.004_255)]"><AiPanel /></div>,
  );
}
