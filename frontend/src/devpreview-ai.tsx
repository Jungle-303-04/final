/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
// ⚠ VP-021 사용성 프리뷰 (더미 · 자가 스트리밍 재생). 배선 완료 시 삭제.
import ReactDOM from "react-dom/client";
import {
  Activity, ArrowUpRight, BellPlus, Boxes, Check, ChevronDown, CircleAlert,
  Clock3, FileText, GitBranch, ListChecks, Play, Plus,
  Send, Server, Sparkles, SquarePen, X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./styles/tokens.css";
import "./styles/foundation.css";
import { Spinner } from "./shared/ui/primitives/spinner";
import {
  DUMMY_CONVERSATION, DUMMY_CONVERSATION_LIST, DUMMY_SUGGESTIONS,
} from "./features/ai-assistant/aiConversationPreviewData";
import type {
  AiMessagePart, AiPageLink, AiResultPart, AiStepsPart, AiTextPart, AiTone, AiTurn,
} from "./features/ai-assistant/aiConversationContract";

const ring: Record<AiTone, string> = { healthy: "border-l-status-healthy", warning: "border-l-status-warning", critical: "border-l-destructive", neutral: "border-l-border" };
const tt: Record<AiTone, string> = { healthy: "text-status-healthy", warning: "text-status-warning", critical: "text-destructive", neutral: "text-muted-foreground" };
const tbg: Record<AiTone, string> = { healthy: "bg-status-healthy/10", warning: "bg-status-warning/10", critical: "bg-destructive/10", neutral: "bg-muted" };
const linkIcon = (i?: AiPageLink["icon"]) => i === "resources" ? Boxes : i === "incident" ? CircleAlert : i === "gitops" ? GitBranch : i === "cluster" ? Server : i === "alert" ? BellPlus : ArrowUpRight;
const evIcon = (t: string) => t === "event" ? CircleAlert : t === "metric" ? Activity : FileText;
const md = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");

function TextPart({ part, active, onReady }: { part: AiTextPart; active: boolean; onReady: () => void }) {
  const [n, setN] = useState(active ? 0 : part.markdown.length);
  useEffect(() => {
    if (!active) { setN(part.markdown.length); return; }
    if (!part.markdown) { onReady(); return; }
    setN(0); let i = 0;
    const id = window.setInterval(() => { i += 2; setN(i); if (i >= part.markdown.length) { window.clearInterval(id); onReady(); } }, 12);
    return () => window.clearInterval(id);
  }, [active]);
  if (!part.markdown) return null;
  return (
    <p className="text-[13px] leading-relaxed text-foreground/90 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_strong]:font-semibold [&_strong]:text-foreground">
      <span dangerouslySetInnerHTML={{ __html: md(part.markdown.slice(0, n)) }} />
      {active && n < part.markdown.length ? <span className="ml-px inline-block h-3.5 w-0.5 animate-pulse bg-primary align-text-bottom" /> : null}
    </p>
  );
}

/** 실행 중엔 단계가 하나씩 켜짐. 끝나면 한 줄 요약으로 접힘(완료 → 축소). */
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
      if (finished) {
        window.clearInterval(id);
        if (!part.running) { onReady(); window.setTimeout(() => setCollapsed(true), 900); }
      }
    }, 620);
    return () => window.clearInterval(id);
  }, [active]);
  const complete = !part.running && done >= total;

  if (collapsed && complete) {
    return (
      <button onClick={() => setCollapsed(false)} type="button"
        className="group flex w-fit items-center gap-2 rounded-lg border border-status-healthy/30 bg-status-healthy/[0.07] px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-status-healthy/10 animate-in fade-in-0 duration-300">
        <ListChecks className="size-3.5 text-status-healthy" />
        <span className="font-medium text-foreground">근거 확인 완료</span>
        <span>· {total}단계{evidenceCount ? ` · 근거 ${evidenceCount}` : ""}</span>
        <ChevronDown className="size-3 opacity-0 transition group-hover:opacity-60" />
      </button>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-gradient-to-b from-muted/50 to-muted/20 transition-all">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs font-medium">
        {complete ? <Check className="size-3.5 text-status-healthy" /> : <Spinner className="size-3.5 text-primary" decorative />}
        <span className="flex-1 text-muted-foreground">{complete ? "처리 완료" : "확인하는 중"}</span>
        <span className="tabular-nums text-muted-foreground">{Math.min(done + (part.running ? 1 : 0), total)}/{total}</span>
      </div>
      <ol className="grid px-1 py-1">
        {part.steps.map((s, i) => {
          const isDone = i < done;
          const isRunning = i === done && (part.running || done < total);
          if (!isDone && !isRunning) return null;
          return (
            <li key={s.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs animate-in fade-in-0 slide-in-from-left-2 duration-300">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-background ring-1 ring-border">
                {isDone ? <Check className="size-3 text-status-healthy animate-in zoom-in-50 duration-200" /> : <Spinner className="size-3 text-primary" decorative />}
              </span>
              <span className="font-medium text-foreground">{s.label}</span>
              <span className="ml-auto truncate text-right text-muted-foreground">{isDone ? s.detail : "…"}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ResultPart({ part }: { part: AiResultPart }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-l-[3px] bg-card ${ring[part.tone]} animate-in fade-in-0 slide-in-from-bottom-1 duration-300`}>
      <div className={`flex items-center gap-2 px-3 py-2 ${tbg[part.tone]}`}>
        <Activity className={`size-4 ${tt[part.tone]}`} />
        <span className="text-sm font-semibold">{part.title}</span>
        <span className="ml-auto text-xs text-muted-foreground">진단 결과</span>
      </div>
      <p className="px-3 pt-2 text-xs text-muted-foreground">{part.summary}</p>
      {part.metrics ? (
        <div className="grid grid-cols-3 gap-px bg-border/60 p-px pt-2 [&>*]:bg-card">
          {part.metrics.map((m) => (
            <div className="grid gap-0.5 px-3 py-2 text-center" key={m.label}>
              <span className={`text-base font-bold tabular-nums ${tt[m.tone]}`}>{m.value}</span>
              <span className="text-[11px] text-muted-foreground">{m.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EvidencePart({ part }: { part: Extract<AiMessagePart, { kind: "evidence" }> }) {
  return (
    <div className="grid gap-1.5">
      <span className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">근거 {part.items.length}</span>
      <div className="overflow-hidden rounded-xl border divide-y">
        {part.items.map((e, i) => {
          const Icon = evIcon(e.type);
          return (
            <a href="#" key={e.id} className="group flex items-center gap-2.5 bg-card px-3 py-2 text-xs transition hover:bg-muted animate-in fade-in-0 slide-in-from-bottom-1 duration-300" style={{ animationDelay: `${i * 70}ms` }}>
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{e.label}</span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{e.type}</span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function ActionPart({ part }: { part: Extract<AiMessagePart, { kind: "action" }> }) {
  const p = part.proposal.payload;
  const [state, setState] = useState<"idle" | "creating" | "created">("idle");
  const created = state === "created";
  return (
    <div className={`overflow-hidden rounded-xl border transition-all duration-300 animate-in fade-in-0 slide-in-from-bottom-1 ${created ? "border-status-healthy/40 bg-status-healthy/[0.05]" : "bg-background"}`}>
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
        <span className={`grid size-6 place-items-center rounded-lg ${created ? "bg-status-healthy/15 text-status-healthy" : "bg-status-warning/15 text-status-warning"}`}>
          {created ? <Check className="size-3.5" /> : <BellPlus className="size-3.5" />}
        </span>
        {created ? "알림 규칙을 만들었습니다" : "알림 규칙을 만들까요?"}
      </div>
      <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-3 py-2.5 text-xs transition-opacity ${created ? "opacity-60" : ""}`}>
        <dt className="text-muted-foreground">이름</dt><dd className="font-medium">{p.name}</dd>
        <dt className="text-muted-foreground">조건</dt><dd className="font-medium">CPU 사용률 {p.comparator} {p.threshold}%</dd>
        <dt className="text-muted-foreground">지속</dt><dd className="font-medium">{p.forSeconds}초 이상</dd>
        <dt className="text-muted-foreground">범위</dt><dd className="font-medium">{p.scope.clusters.join(", ") || "현재 화면"}</dd>
      </dl>
      <div className="flex items-center gap-2 border-t px-3 py-2.5">
        {created ? (
          <a href="#" className="inline-flex items-center gap-1.5 text-sm font-medium text-status-healthy">규칙 보기 <ArrowUpRight className="size-3.5" /></a>
        ) : (
          <>
            <button type="button" disabled={state === "creating"} onClick={() => { setState("creating"); setTimeout(() => setState("created"), 950); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-xs transition active:scale-95 disabled:opacity-60">
              {state === "creating" ? <Spinner className="size-4" decorative /> : <BellPlus className="size-4" />}
              {state === "creating" ? "만드는 중" : "알림 만들기"}
            </button>
            <button type="button" className="rounded-lg border px-3 py-1.5 text-sm transition hover:bg-muted">수정</button>
          </>
        )}
      </div>
    </div>
  );
}

function LinksPart({ part }: { part: Extract<AiMessagePart, { kind: "links" }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {part.items.map((l, i) => { const Icon = linkIcon(l.icon); return (
        <a href="#" key={l.href} className="group inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium shadow-xs transition hover:border-foreground/20 hover:bg-muted animate-in fade-in-0 slide-in-from-bottom-1 duration-300" style={{ animationDelay: `${i * 70}ms` }}>
          <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground"><Icon className="size-3.5" /></span>
          {l.label}
          <ArrowUpRight className="size-3.5 text-muted-foreground transition group-hover:translate-x-0.5" />
        </a>
      ); })}
    </div>
  );
}

function PartView({ part, active, onReady, evidenceCount }: { part: AiMessagePart; active: boolean; onReady: () => void; evidenceCount: number }) {
  const fired = useRef(false);
  const ready = () => { if (!fired.current) { fired.current = true; onReady(); } };
  useEffect(() => { fired.current = false; }, [active]);
  useEffect(() => {
    if (active && !(part.kind === "text" || part.kind === "steps")) {
      const id = window.setTimeout(ready, 520); return () => window.clearTimeout(id);
    }
  }, [active]);
  if (part.kind === "text") return <TextPart active={active} onReady={ready} part={part} />;
  if (part.kind === "steps") return <StepsPart active={active} evidenceCount={evidenceCount} onReady={ready} part={part} />;
  if (part.kind === "result") return <ResultPart part={part} />;
  if (part.kind === "evidence") return <EvidencePart part={part} />;
  if (part.kind === "links") return <LinksPart part={part} />;
  if (part.kind === "action") return <ActionPart part={part} />;
  if (part.kind === "status" && part.state === "pending")
    return <p className="w-fit animate-pulse rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground motion-reduce:animate-none">확인하고 있습니다…</p>;
  return null;
}

function AssistantTurn({ turn, onComplete, dim }: { turn: AiTurn; onComplete: () => void; dim: boolean }) {
  const parts = turn.parts ?? [];
  const evidenceCount = (parts.find((p) => p.kind === "evidence") as { items?: unknown[] } | undefined)?.items?.length ?? 0;
  const [shown, setShown] = useState(1);
  const advance = () => setShown((s) => { if (s >= parts.length) { onComplete(); return s; } return s + 1; });
  useEffect(() => { if (parts.length === 0) onComplete(); }, []);
  return (
    <div className={`mr-auto grid w-full max-w-[97%] gap-2.5 rounded-2xl rounded-bl-md border bg-card px-3 py-3 shadow-xs transition-opacity duration-500 animate-in fade-in-0 slide-in-from-bottom-2 ${dim ? "opacity-70" : ""}`}>
      {parts.slice(0, shown).map((part, i) => (
        <PartView active={i === shown - 1} evidenceCount={evidenceCount} key={i} onReady={i === shown - 1 ? advance : () => {}} part={part} />
      ))}
    </div>
  );
}

function Thinking() {
  return (
    <div className="mr-auto flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md border bg-card px-4 py-3 shadow-xs animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
      {[0, 1, 2].map((i) => <span className="size-1.5 animate-bounce rounded-full bg-primary/60 motion-reduce:animate-none" key={i} style={{ animationDelay: `${i * 160}ms` }} />)}
    </div>
  );
}

function UserTurn({ turn, onShown }: { turn: AiTurn; onShown: () => void }) {
  useEffect(() => { const id = window.setTimeout(onShown, 500); return () => window.clearTimeout(id); }, []);
  return <p className="ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 zoom-in-95 duration-300">{turn.question}</p>;
}

function CollapsedTurn({ turn, onShown }: { turn: AiTurn; onShown: () => void }) {
  useEffect(() => { const id = window.setTimeout(onShown, 300); return () => window.clearTimeout(id); }, []);
  return (
    <div className="mr-auto flex w-full items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground animate-in fade-in-0 duration-300">
      <span className="grid size-5 place-items-center rounded-full bg-destructive/10 text-destructive"><CircleAlert className="size-3" /></span>
      <span className="flex-1 truncate">{turn.summary}</span>
      <ChevronDown className="size-3.5 -rotate-90 opacity-50" />
    </div>
  );
}

const now = () => new Date().toISOString();
/** 더미: 질문 키워드로 그럴듯한 어시스턴트 응답 파트를 만든다(실제 배선 시 삭제). */
function scriptedReply(id: string, q: string): AiTurn {
  const base = { id, role: "assistant" as const, collapsed: false, createdAt: now() };
  if (/알람|알림|alert|걸어/.test(q)) {
    return { ...base, parts: [
      { kind: "text", markdown: "현재 화면 범위(클러스터 `cluster-2`)로 알림 규칙 초안을 제안합니다. 내용을 확인해 주세요." },
      { kind: "action", proposal: { type: "create_alert_rule", rationale: "현재 화면 필터에서 CPU가 70%를 20초 이상 넘으면 알리도록 제안했습니다.", payload: { name: "파드 CPU 70% 알림", metric: "cpu_pct", comparator: ">", threshold: 70, forSeconds: 20, severity: "high", scope: { clusters: ["cluster-2"], namespaces: [], applications: [], labels: [] }, channels: [], enabled: true } } },
    ] };
  }
  if (/위험|상태|어때|health|문제|이상/.test(q)) {
    return { ...base, parts: [
      { kind: "steps", running: false, steps: [
        { id: id + "a", label: "리소스 조회", detail: "42건 · 파드 37", state: "done" },
        { id: id + "b", label: "상태 평가", detail: "위험 1 · 경고 2", state: "done" },
      ] },
      { kind: "text", markdown: "지금 이 클러스터에서 **위험 1건**(checkout-api OOMKilled)과 경고 2건이 관측됩니다. 나머지 파드는 정상입니다." },
      { kind: "result", title: "위험 1 · 경고 2", tone: "warning", summary: "checkout-api 메모리 초과가 가장 시급합니다.", metrics: [
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
    { kind: "text", markdown: "관측된 근거를 바탕으로 요약했습니다. 자세한 내용은 아래 근거에서 확인하세요." },
    { kind: "evidence", items: [
      { type: "event", id: id + "e", label: "Event · 최근 변경 3건", link: "/resources" },
      { type: "log", id: id + "l", label: "로그 · 관련 라인", link: "/resources" },
    ] },
  ] };
}

function Panel() {
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
  useLayoutEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); });

  const reveal = () => setCount((c) => {
    const t = turnsRef.current;
    const next = c + 1; if (next > t.length) return c;
    if (t[next - 1].role === "user") window.setTimeout(reveal, 550);
    return next;
  });
  const afterAssistant = () => { if (count < turnsRef.current.length) { setThinking(true); window.setTimeout(() => { setThinking(false); reveal(); }, 750); } };

  const send = (text: string) => {
    const t = text.trim(); if (!t) return;
    setInput("");
    idSeq.current += 1;
    const userTurn: AiTurn = { id: `u${idSeq.current}`, role: "user", question: t, collapsed: false, createdAt: now() };
    const withUser = [...turnsRef.current, userTurn];
    turnsRef.current = withUser; setTurns(withUser); setCount(withUser.length);
    setThinking(true);
    window.setTimeout(() => {
      setThinking(false);
      idSeq.current += 1;
      const withA = [...turnsRef.current, scriptedReply(`a${idSeq.current}`, t)];
      turnsRef.current = withA; setTurns(withA); setCount(withA.length);
    }, 850);
  };

  useEffect(() => {
    setTurns(DUMMY_CONVERSATION.turns); turnsRef.current = DUMMY_CONVERSATION.turns;
    setCount(1);
    const a = window.setTimeout(() => setCount(2), 500);
    const b = window.setTimeout(() => setCount(3), 1050);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [runId]);

  const lastAssistantIdx = (() => { for (let i = Math.min(count, turns.length) - 1; i >= 0; i--) if (turns[i].role === "assistant" && !turns[i].collapsed) return i; return -1; })();

  return (
    <div className="relative flex h-screen w-[460px] flex-col border-l bg-background shadow-2xl" key={runId}>
      <header className="flex items-center gap-2 border-b bg-card/60 px-3 py-2.5 backdrop-blur">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Sparkles className="size-4" /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold leading-tight">Opsia AI</h2><p className="truncate text-[11px] text-muted-foreground">현재 화면 맥락으로 질문하고 근거를 확인합니다</p></div>
        <button className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={() => setRunId((r) => r + 1)} title="재생" type="button"><Play className="size-4" /></button>
        <button className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={() => setListOpen((v) => !v)} title="대화 목록" type="button"><SquarePen className="size-4" /></button>
        <button className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" title="새 대화" type="button"><Plus className="size-4" /></button>
        <button className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" title="닫기" type="button"><X className="size-4" /></button>
      </header>
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">맥락</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium animate-in fade-in-0 zoom-in-95 duration-300"><Boxes className="size-3" />resources</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium animate-in fade-in-0 zoom-in-95 duration-300 delay-75"><Server className="size-3" />cluster-2</span>
      </div>
      {listOpen ? (
        <div className="absolute inset-x-0 top-[94px] z-10 border-b bg-background/95 shadow-lg backdrop-blur animate-in fade-in-0 slide-in-from-top-2 duration-150">
          <ul className="grid gap-0.5 p-2">{DUMMY_CONVERSATION_LIST.map((c) => (
            <li key={c.id}><button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-muted" type="button"><Sparkles className="size-3.5 shrink-0 text-muted-foreground" /><span className="flex-1 truncate">{c.title}</span><span className="shrink-0 text-xs text-muted-foreground">{c.updatedAt}</span></button></li>
          ))}</ul>
        </div>
      ) : null}

      <div className="flex-1 space-y-3 overflow-y-auto scroll-smooth px-3 py-4" ref={scrollRef}>
        {turns.slice(0, count).map((turn, idx) => {
          if (turn.role === "user") return <UserTurn key={turn.id} onShown={reveal} turn={turn} />;
          if (turn.collapsed) return <CollapsedTurn key={turn.id} onShown={reveal} turn={turn} />;
          return <AssistantTurn dim={idx !== lastAssistantIdx} key={turn.id} onComplete={afterAssistant} turn={turn} />;
        })}
        {thinking ? <Thinking /> : null}
      </div>

      <div className="border-t bg-card/40 p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">{DUMMY_SUGGESTIONS.map((s) => <button className="rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground shadow-xs transition hover:border-foreground/20 hover:text-foreground" key={s} onClick={() => send(s)} type="button">{s}</button>)}</div>
        <div className="relative rounded-xl border bg-background shadow-xs transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <textarea
            className="min-h-16 w-full resize-none rounded-xl bg-transparent px-3 py-2.5 pr-11 text-sm outline-none"
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
            placeholder="지금 보고 있는 것에 대해 질문하세요…"
            value={input}
          />
          <button className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm transition active:scale-90 disabled:opacity-50" disabled={!input.trim()} onClick={() => send(input)} title="보내기" type="button"><Send className="size-4" /></button>
        </div>
        <p className="mt-1.5 flex items-center gap-1 px-0.5 text-[11px] text-muted-foreground"><Clock3 className="size-3" /> 완료된 대화는 시간이 지나면 자동으로 요약되어 접힙니다.</p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div className="flex min-h-screen justify-end bg-[oklch(0.96_0.005_255)]"><Panel /></div>,
);
