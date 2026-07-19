// ── 데모 서피스: 배포 · 이슈 · 타임라인 · 점검 · 비용 · 설정 (Master Spec 5.7~5.10) ──
// 원칙: 모든 숫자는 단일 인벤토리(podInventory/nodeInventory/repoInventory) 파생 — 두 화면이 다른 숫자를 말하면 버그.
// 시각은 공용 부품(KpiValue/MiniBars/RankList/MiniTimeline)과 셸 토큰만 사용. 제품 이식 시 D5 공용 표로 수렴한다.
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Rocket, Package, AlertTriangle, Bell, Clock, ShieldCheck, Coins, Server,
  Building2, Globe, Radio, Check, ChevronDown, Sparkles, GitBranch, ArrowRight, X,
} from "lucide-react";
import { UI, BLUE, HP, TINT, MONO, TYPE, SOFT, DUR, inkA, blueA, critA, BRAND } from "./devpreview/theme";
import { GithubIcon, AwsIcon } from "./devpreview/brandIcons";
import { podInventory, nodeInventory, repoInventory, svcCatalog } from "./devpreview-opsia";
import { KpiValue, MiniBars, RankList, MiniTimeline } from "./devpreview/widgets";

// ── 공통 프레임: 제목 + 주 액션 1개(P-43) + 탭 ──
function Page({ title, icon: I, action, tabs, tab, onTab, children }: {
  title: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  action?: React.ReactNode; tabs?: string[]; tab?: string; onTab?: (t: string) => void; children: React.ReactNode;
}) {
  return (
    <main style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16, padding: "14px 18px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <I size={17} style={{ color: BLUE }} />
        <span style={{ fontSize: TYPE.heading, fontWeight: 800, letterSpacing: "-0.02em", color: UI.ink }}>{title}</span>
        <span style={{ marginLeft: "auto" }}>{action}</span>
      </div>
      {tabs && (
        <div style={{ display: "flex", gap: 2, background: inkA(0.05), borderRadius: 9, padding: 2, width: "fit-content" }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => onTab?.(t)}
              style={{ position: "relative", border: "none", background: "transparent", borderRadius: 7, padding: "5px 16px", fontSize: TYPE.label2, fontWeight: 700, color: tab === t ? UI.ink : UI.ink3, cursor: "pointer" }}>
              {tab === t && <motion.span layoutId={`ptab-${title}`} transition={SOFT} style={{ position: "absolute", inset: 0, background: UI.card, borderRadius: 7, boxShadow: `0 1px 4px ${inkA(0.14)}` }} />}
              <span style={{ position: "relative" }}>{t}</span>
            </button>
          ))}
        </div>
      )}
      {children}
    </main>
  );
}

const Card = ({ children, pad = 15 }: { children: React.ReactNode; pad?: number }) => (
  <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: pad, minWidth: 0 }}>{children}</div>
);
const SettingsRow = ({ icon: I, title, sub, right }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; title: string; sub: string; right: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderBottom: `1px solid ${UI.line2}` }}>
    <span style={{ width: 32, height: 32, borderRadius: 9, background: inkA(0.05), display: "grid", placeItems: "center", flexShrink: 0 }}><I size={16} style={{ color: UI.ink2 }} /></span>
    <span style={{ minWidth: 0, flex: 1 }}>
      <span style={{ display: "block", fontSize: TYPE.body, fontWeight: 700, color: UI.ink }}>{title}</span>
      <span style={{ display: "block", fontSize: TYPE.caption2, color: UI.ink3, marginTop: 1 }}>{sub}</span>
    </span>
    {right}
  </div>
);
const Pill = ({ tone, label }: { tone: "ok" | "warn" | "crit" | "info"; label: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: TYPE.caption, fontWeight: 700, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap",
    color: tone === "ok" ? TINT.ok.fg : tone === "warn" ? TINT.warn.fg : tone === "crit" ? TINT.crit.fg : TINT.blue.fg,
    background: tone === "ok" ? TINT.ok.bg : tone === "warn" ? TINT.warn.bg : tone === "crit" ? critA(0.09) : blueA(0.08),
    border: `1px solid ${tone === "ok" ? TINT.ok.bd : tone === "warn" ? TINT.warn.bd : tone === "crit" ? critA(0.3) : blueA(0.25)}` }}>
    <span className={tone !== "ok" ? "pulsedot" : undefined} style={{ width: 5, height: 5, borderRadius: 999, background: tone === "info" ? BLUE : HP[tone] }} />{label}
  </span>
);
// 간이 표 행 — 제품에서는 D5 공용 표가 오너(여기서는 같은 타이포·헤어라인 문법만 재현)
function THead({ cols }: { cols: [string, string][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols.map(([, w]) => w).join(" "), gap: 12, padding: "8px 14px", borderBottom: `1px solid ${UI.line}`, background: UI.bg2 }}>
      {cols.map(([l]) => <span key={l} style={{ fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.05em", color: UI.ink3 }}>{l}</span>)}
    </div>
  );
}
function TRow({ cols, cells, onClick, i = 0 }: { cols: [string, string][]; cells: React.ReactNode[]; onClick?: () => void; i?: number }) {
  return (
    <motion.button initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: Math.min(i, 8) * 0.04 }}
      onClick={onClick} disabled={!onClick} className={onClick ? "rrow" : undefined}
      style={{ display: "grid", gridTemplateColumns: cols.map(([, w]) => w).join(" "), gap: 12, alignItems: "center", width: "100%", textAlign: "left", border: "none", background: "transparent", borderBottom: `1px solid ${UI.line2}`, padding: "10px 14px", cursor: onClick ? "pointer" : "default" }}>
      {cells.map((c, j) => <span key={j} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: TYPE.label2, color: UI.ink }}>{c}</span>)}
    </motion.button>
  );
}
// 서피스 요약 칩 — 홈·지도 상태 요약 줄과 같은 칩 문법(제품 P2에서 공용 컴포넌트로 수렴)
const segStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.label, fontWeight: 600, color: UI.ink2, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 999, padding: "5px 11px", whiteSpace: "nowrap" };
const numStyle: React.CSSProperties = { fontFamily: MONO, fontWeight: 700, color: UI.ink, fontVariantNumeric: "tabular-nums" };
function ChipRow({ chips }: { chips: { label: string; value: React.ReactNode; warn?: boolean; crit?: boolean }[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {chips.map((c) => (
        <span key={c.label} style={{ ...segStyle, ...(c.crit ? { borderColor: TINT.crit.bd, background: TINT.crit.bg, color: TINT.crit.fg } : c.warn ? { borderColor: TINT.warn.bd, background: TINT.warn.bg, color: TINT.warn.fg } : {}) }}>
          {c.label} <b style={numStyle}>{c.value}</b>
        </span>
      ))}
    </div>
  );
}

const Mono = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => (
  <span style={{ fontFamily: MONO, fontSize: TYPE.label, color: dim ? UI.ink3 : UI.ink, fontVariantNumeric: "tabular-nums" }}>{children}</span>
);

// ── 비용 단일 소스 — 노드 스펙에서 파생(홈 W7과 이 서피스가 같은 함수를 쓴다) ──
export function costModel() {
  const nodes = nodeInventory();
  const rate = (inst: string) => (inst.includes("2xlarge") ? 345 : inst.includes("xlarge") ? 172 : 86); // 월 USD 근사
  const rows = nodes.map((n) => ({ ...n, monthly: rate(n.instance) }));
  const gross = rows.reduce((s, n) => s + n.monthly, 0);
  const spotSave = Math.round(gross * 0.11);
  const total = gross - spotSave;
  const prev = Math.round(total / 1.042);
  const monthly = [0.68, 0.72, 0.79, 0.77, 0.87, 0.92, 0.96, 1].map((f) => Math.round(total * f));
  return { rows, gross, spotSave, total, prev, delta: "+4.2%", diff: total - prev, monthly, labels: ["12", "1", "2", "3", "4", "5", "6", "7"] };
}

// ── 타임라인 단일 소스 — 홈 W8은 이 목록의 상위 5개를 그대로 쓴다 ──
export type TlItem = { id: string; time: string; tone: "ok" | "warn" | "crit"; cat: "이슈" | "배포" | "구성"; title: string; ref?: { kind: string; name: string } };
export function timelineItems(): TlItem[] {
  const pods = podInventory(); const repos = repoInventory();
  const crit = pods.filter((p) => p.bad); const out = repos.filter((r) => r.sync === "OutOfSync");
  return [
    ...crit.slice(0, 1).map((p) => ({ id: `t-${p.name}`, time: "2분 전", tone: "crit" as const, cat: "이슈" as const, title: `${p.name} ${p.status} — 재시작 ${p.restarts}회`, ref: { kind: "Pod", name: p.name } })),
    ...out.map((r) => ({ id: `t-${r.repo}`, time: "17분 전", tone: "warn" as const, cat: "배포" as const, title: `${r.repo} 동기화 지연 · 리비전 ${r.rev}` })),
    { id: "t-scale", time: "44분 전", tone: "ok", cat: "배포", title: `shop-api 스케일 아웃 완료 — 파드 ${pods.filter((p) => p.svc === "shop-api").length}개 유지` },
    ...crit.slice(1).map((p, i) => ({ id: `t2-${p.name}`, time: `${52 + i * 9}분 전`, tone: "crit" as const, cat: "이슈" as const, title: `${p.name} ${p.status} 감지 — 근거 수집 시작`, ref: { kind: "Pod", name: p.name } })),
    { id: "t-node", time: "1시간 전", tone: "ok", cat: "구성", title: "prod-eks 노드 그룹 롤링 업데이트 종료" },
    { id: "t-cfg", time: "2시간 전", tone: "ok", cat: "구성", title: "app-config ConfigMap 갱신 · 3개 서비스 재기동", ref: { kind: "ConfigMap", name: "app-config" } },
    { id: "t-dep2", time: "2시간 전", tone: "ok", cat: "배포", title: `${repos[0]?.repo ?? "Jungle-303-04/final"} main 배포 · 정상` },
    { id: "t-hpa", time: "3시간 전", tone: "ok", cat: "구성", title: "shop-api HPA 상한 8 → 12 조정", ref: { kind: "HPA", name: "shop-api" } },
  ];
}

// ── 배포 /deploy — 탭: 애플리케이션 | GitOps | Helm 릴리스 (ArgoCD 패턴, 5.7) ──
export function DeploySurface({ pendingRepos = [], onOpenRef, onAddRepo }: {
  pendingRepos?: string[]; onOpenRef: (kind: string, name: string) => void; onAddRepo: () => void;
}) {
  const [tab, setTab] = useState("애플리케이션");
  const pods = useMemo(() => podInventory(), []);
  const repos = useMemo(() => repoInventory(), []);
  const apps = useMemo(() => svcCatalog().map((s) => {
    const own = pods.filter((p) => p.svc === s.id);
    const repo = repos.find((r) => r.repo === s.repo);
    return { ...s, pods: own.length, crit: own.filter((p) => p.bad).length, sync: repo?.sync ?? "Synced", rev: repo?.rev ?? "-", tool: repo?.tool ?? "Argo CD" };
  }), [pods, repos]);
  const HELM = [
    { rel: "redis", chart: "bitnami/redis", ver: "18.1.2", app: "8.2.3", ns: "platform", status: "deployed" },
    { rel: "postgres", chart: "bitnami/postgresql", ver: "15.5.0", app: "16.4", ns: "platform", status: "deployed" },
    { rel: "ingress-nginx", chart: "ingress-nginx", ver: "4.11.3", app: "1.11.3", ns: "kube-system", status: "deployed" },
  ];
  const appCols: [string, string][] = [["앱", "minmax(140px,1.4fr)"], ["네임스페이스", "minmax(80px,0.8fr)"], ["동기화", "minmax(96px,0.9fr)"], ["헬스", "minmax(90px,0.8fr)"], ["파드", "56px"], ["리비전", "minmax(80px,0.9fr)"]];
  const repoCols: [string, string][] = [["저장소", "minmax(180px,1.6fr)"], ["도구", "minmax(80px,0.7fr)"], ["리비전", "minmax(90px,0.8fr)"], ["동기화", "minmax(110px,1fr)"], ["앱", "48px"]];
  const helmCols: [string, string][] = [["릴리스", "minmax(120px,1.1fr)"], ["차트", "minmax(150px,1.4fr)"], ["차트 버전", "minmax(80px,0.8fr)"], ["앱 버전", "minmax(70px,0.7fr)"], ["네임스페이스", "minmax(90px,0.9fr)"], ["상태", "minmax(90px,0.8fr)"]];
  return (
    <Page title="배포" icon={Rocket} tabs={["애플리케이션", "GitOps", "워크플로우", "Helm 릴리스"]} tab={tab} onTab={setTab}
      action={tab === "GitOps"
        ? <button onClick={onAddRepo} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: BLUE, color: UI.card, borderRadius: 9, padding: "6px 13px", fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>+ 저장소 연결</button>
        : null}>
      <ChipRow chips={[
        { label: "앱", value: apps.length },
        { label: "Synced", value: apps.filter((x) => x.sync !== "OutOfSync").length },
        { label: "OutOfSync", value: apps.filter((x) => x.sync === "OutOfSync").length, warn: apps.some((x) => x.sync === "OutOfSync") },
        { label: "저장소", value: repos.length + pendingRepos.length },
      ]} />
      {tab === "애플리케이션" && (
        <Card pad={0}>
          <THead cols={appCols} />
          {apps.map((a, i) => (
            <TRow key={a.id} cols={appCols} i={i} onClick={() => onOpenRef("Service", a.id)} cells={[
              <span key="n" style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: a.color, flexShrink: 0 }} /><Mono>{a.id}</Mono></span>,
              <Mono key="ns" dim>{a.ns}</Mono>,
              <Pill key="s" tone={a.sync === "OutOfSync" ? "warn" : "ok"} label={a.sync} />,
              a.crit > 0 ? <Pill key="h" tone="crit" label={`장애 ${a.crit}`} /> : <Pill key="h" tone="ok" label="정상" />,
              <Mono key="p">{a.pods}</Mono>,
              <Mono key="r" dim>{a.rev}</Mono>,
            ]} />
          ))}
        </Card>
      )}
      {tab === "GitOps" && (
        <Card pad={0}>
          <THead cols={repoCols} />
          {repos.map((r, i) => (
            <TRow key={r.repo} cols={repoCols} i={i} cells={[
              <span key="n" style={{ display: "flex", alignItems: "center", gap: 8 }}><GithubIcon size={13} style={{ color: BRAND.github, flexShrink: 0 }} /><Mono>{r.repo}</Mono></span>,
              <span key="t" style={{ fontSize: TYPE.label, color: UI.ink2 }}>{r.tool}</span>,
              <Mono key="v" dim>{r.rev}</Mono>,
              <Pill key="s" tone={r.sync === "OutOfSync" ? "warn" : "ok"} label={r.sync} />,
              <Mono key="a">{svcCatalog().filter((s) => s.repo === r.repo).length}</Mono>,
            ]} />
          ))}
          {pendingRepos.map((r, i) => (
            <TRow key={r} cols={repoCols} i={repos.length + i} cells={[
              <span key="n" style={{ display: "flex", alignItems: "center", gap: 8 }}><GithubIcon size={13} style={{ color: UI.ink3, flexShrink: 0 }} /><Mono>{r}</Mono></span>,
              <span key="t" style={{ fontSize: TYPE.label, color: UI.ink2 }}>Argo CD</span>,
              <Mono key="v" dim>—</Mono>,
              <Pill key="s" tone="info" label="연결 중" />,
              <Mono key="a" dim>—</Mono>,
            ]} />
          ))}
        </Card>
      )}
      {tab === "워크플로우" && <WorkflowsTab repos={repos.map((r) => r.repo)} />}
      {tab === "Helm 릴리스" && (
        <Card pad={0}>
          <THead cols={helmCols} />
          {HELM.map((h, i) => (
            <TRow key={h.rel} cols={helmCols} i={i} onClick={() => onOpenRef("StatefulSet", h.rel)} cells={[
              <span key="n" style={{ display: "flex", alignItems: "center", gap: 8 }}><Package size={13} style={{ color: BLUE, flexShrink: 0 }} /><Mono>{h.rel}</Mono></span>,
              <Mono key="c" dim>{h.chart}</Mono>, <Mono key="v">{h.ver}</Mono>, <Mono key="a">{h.app}</Mono>,
              <Mono key="ns" dim>{h.ns}</Mono>, <Pill key="s" tone="ok" label={h.status} />,
            ]} />
          ))}
        </Card>
      )}
    </Page>
  );
}

// ── 이슈 /issues — 탭: 이슈 | 알림 규칙 (5.8) ──
export function IssuesSurface({ sessionRules = [], onOpenRef, onAskAi }: {
  sessionRules?: string[]; onOpenRef: (kind: string, name: string) => void; onAskAi: () => void;
}) {
  const [tab, setTab] = useState("이슈");
  const pods = useMemo(() => podInventory(), []);
  const crit = pods.filter((p) => p.bad);
  const [rules, setRules] = useState(() => [
    { name: "파드 재시작 급증", cond: "restarts > 3 / 10m", sev: "장애", on: true, ai: false },
    { name: "노드 디스크 압박", cond: "disk > 85%", sev: "주의", on: true, ai: false },
    ...sessionRules.map((n) => ({ name: n, cond: "cpu_pct > 70 · 20s", sev: "장애", on: true, ai: true })),
  ]);
  const incCols: [string, string][] = [["심각도", "96px"], ["이슈", "minmax(200px,2fr)"], ["대상", "minmax(120px,1fr)"], ["시작", "76px"], ["상태", "80px"]];
  const ruleCols: [string, string][] = [["규칙", "minmax(150px,1.4fr)"], ["조건", "minmax(150px,1.3fr)"], ["심각도", "80px"], ["활성", "64px"]];
  return (
    <Page title="이슈" icon={AlertTriangle} tabs={["이슈", "알림 규칙"]} tab={tab} onTab={setTab}
      action={tab === "이슈" ? <button onClick={onAskAi} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${blueA(0.4)}`, background: blueA(0.07), color: BLUE, borderRadius: 9, padding: "6px 13px", fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>AI로 원인 분석</button> : null}>
      <ChipRow chips={[
        { label: "장애", value: crit.length, crit: crit.length > 0 },
        { label: "주의", value: pods.filter((p) => !p.bad && p.restarts >= 2).length, warn: true },
        { label: "open", value: crit.length },
        { label: "규칙", value: rules.length },
      ]} />
      {tab === "이슈" && (
        <Card pad={0}>
          <THead cols={incCols} />
          {crit.map((p, i) => (
            <TRow key={p.name} cols={incCols} i={i} onClick={() => onOpenRef("Pod", p.name)} cells={[
              <Pill key="s" tone="crit" label="장애" />,
              <span key="t"><Mono>{p.name}</Mono><span style={{ fontSize: TYPE.label, color: UI.ink2 }}> · {p.status} — 컨테이너가 반복 종료됨</span></span>,
              <Mono key="d" dim>{p.svc} · {p.cluster}</Mono>,
              <Mono key="w" dim>{2 + (p.cpu % 9)}분 전</Mono>,
              <Pill key="st" tone="warn" label="open" />,
            ]} />
          ))}
          {pods.filter((p) => !p.bad && p.restarts >= 2).slice(0, 2).map((p, i) => (
            <TRow key={p.name} cols={incCols} i={crit.length + i} onClick={() => onOpenRef("Pod", p.name)} cells={[
              <Pill key="s" tone="warn" label="주의" />,
              <span key="t"><Mono>{p.name}</Mono><span style={{ fontSize: TYPE.label, color: UI.ink2 }}> · 재시작 반복 — 관찰 중</span></span>,
              <Mono key="d" dim>{p.svc} · {p.cluster}</Mono>,
              <Mono key="w" dim>1시간 전</Mono>,
              <Pill key="st" tone="ok" label="ack" />,
            ]} />
          ))}
        </Card>
      )}
      {tab === "알림 규칙" && (
        <Card pad={0}>
          <THead cols={ruleCols} />
          {rules.map((r, i) => (
            <TRow key={r.name} cols={ruleCols} i={i} cells={[
              <span key="n" style={{ display: "flex", alignItems: "center", gap: 7 }}><Bell size={13} style={{ color: BLUE, flexShrink: 0 }} /><span style={{ fontSize: TYPE.label2, fontWeight: 600 }}>{r.name}</span>{r.ai && <span style={{ fontSize: TYPE.micro, fontWeight: 800, color: BLUE, background: blueA(0.1), borderRadius: 4, padding: "1px 5px" }}>AI</span>}</span>,
              <Mono key="c" dim>{r.cond}</Mono>,
              <Pill key="s" tone={r.sev === "장애" ? "crit" : "warn"} label={r.sev} />,
              <button key="t" onClick={(e) => { e.stopPropagation(); setRules((rs) => rs.map((x) => x.name === r.name ? { ...x, on: !x.on } : x)); }}
                style={{ width: 34, height: 20, borderRadius: 999, border: "none", cursor: "pointer", background: r.on ? HP.ok : inkA(0.15), position: "relative", transition: "background .2s" }}>
                <span style={{ position: "absolute", top: 2, left: r.on ? 16 : 2, width: 16, height: 16, borderRadius: 999, background: UI.card, boxShadow: `0 1px 3px ${inkA(0.3)}`, transition: "left .2s" }} />
              </button>,
            ]} />
          ))}
        </Card>
      )}
    </Page>
  );
}

// ── 타임라인 /timeline (5.9 — P-21 문법 + 유형 필터 칩 P-22) ──
export function TimelineSurface({ onOpenRef }: { onOpenRef: (kind: string, name: string) => void }) {
  const [cat, setCat] = useState<"전체" | TlItem["cat"]>("전체");
  const items = useMemo(() => timelineItems(), []);
  const shown = cat === "전체" ? items : items.filter((i) => i.cat === cat);
  return (
    <Page title="타임라인" icon={Clock}>
      <div style={{ display: "flex", gap: 6 }}>
        {(["전체", "배포", "이슈", "구성"] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)}
            style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${cat === c ? blueA(0.45) : UI.line}`, background: cat === c ? blueA(0.07) : UI.card, color: cat === c ? BLUE : UI.ink2, borderRadius: 999, padding: "4px 13px", fontSize: TYPE.label, fontWeight: 700, cursor: "pointer" }}>{c}
            <span style={{ fontFamily: MONO, fontSize: TYPE.micro, color: cat === c ? BLUE : UI.ink3 }}>{c === "전체" ? items.length : items.filter((i) => i.cat === c).length}</span>
          </button>
        ))}
      </div>
      <Card>
        <MiniTimeline items={shown.map(({ cat: _c, ...it }) => it)} onPick={(r) => onOpenRef(r.kind, r.name)} />
      </Card>
    </Page>
  );
}

// ── 점검 /checks (5.10 — 정책 결과, 대상 클릭=상세 시트) ──
export function ChecksSurface({ onOpenRef }: { onOpenRef: (kind: string, name: string) => void }) {
  const [showPassed, setShowPassed] = useState(false);
  const pods = useMemo(() => podInventory(), []);
  const crit = pods.filter((p) => p.bad);
  const bestEffort = pods.filter((p) => p.qos === "BestEffort" && !p.bad).slice(0, 3);
  const rows = [
    ...crit.map((p) => ({ pol: "컨테이너 반복 종료", target: p.name, kind: "Pod", sev: "장애" as const, note: `${p.status} · 재시작 ${p.restarts}회` })),
    ...bestEffort.map((p) => ({ pol: "리소스 요청 미설정", target: p.name, kind: "Pod", sev: "주의" as const, note: "QoS BestEffort — 축출 우선순위 높음" })),
    { pol: "이미지 태그 고정", target: "shop-web", kind: "Service", sev: "주의" as const, note: "latest 태그 사용 1건" },
  ];
  const POLICY_CATALOG = [
    "컨테이너 반복 종료", "리소스 요청 미설정", "이미지 태그 고정", "권한 상승 금지", "루트 실행 금지",
    "호스트 네트워크 금지", "호스트 경로 마운트 제한", "리소스 한도 필수", "레지스트리 허용 목록", "Secret 환경변수 노출 금지",
    "PDB 존재", "복제본 2 이상", "프로브 설정(liveness)", "프로브 설정(readiness)", "이미지 서명 검증",
    "네트워크 정책 존재", "네임스페이스 라벨 규약", "서비스 어카운트 전용", "만료 인증서 감시", "권한(RBAC) 와일드카드 금지",
    "스토리지 암호화", "노드 격리 라벨", "우선순위 클래스 지정", "종료 유예 설정",
  ];
  const violated = new Set(rows.map((r) => r.pol));
  const passedList = POLICY_CATALOG.filter((pn) => !violated.has(pn));
  const passed = passedList.length;
  const cols: [string, string][] = [["정책", "minmax(150px,1.3fr)"], ["대상", "minmax(130px,1.1fr)"], ["심각도", "84px"], ["내용", "minmax(200px,1.8fr)"]];
  return (
    <Page title="점검" icon={ShieldCheck}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill tone="ok" label={`통과 ${passed}`} /><Pill tone="warn" label={`주의 ${rows.filter((r) => r.sev === "주의").length}`} /><Pill tone="crit" label={`장애 ${rows.filter((r) => r.sev === "장애").length}`} />
        <span style={{ fontSize: TYPE.label, color: UI.ink3, alignSelf: "center" }}>정책 24개 · 마지막 검사 방금 전</span>
      </div>
      <Card pad={0}>
        <THead cols={cols} />
        {rows.map((r, i) => (
          <TRow key={`${r.pol}-${r.target}`} cols={cols} i={i} onClick={() => onOpenRef(r.kind, r.target)} cells={[
            <span key="p" style={{ fontSize: TYPE.label2, fontWeight: 600 }}>{r.pol}</span>,
            <Mono key="t">{r.target}</Mono>,
            <Pill key="s" tone={r.sev === "장애" ? "crit" : "warn"} label={r.sev} />,
            <span key="n" style={{ fontSize: TYPE.label, color: UI.ink2 }}>{r.note}</span>,
          ]} />
        ))}
      </Card>
      <Card pad={0}>
        <button onClick={() => setShowPassed(!showPassed)} className="rrow"
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "12px 15px", cursor: "pointer" }}>
          <Check size={14} style={{ color: HP.ok }} />
          <span style={{ fontSize: TYPE.label2, fontWeight: 700, color: UI.ink }}>통과한 정책 {passed}</span>
          <ChevronDown size={13} style={{ color: UI.ink3, marginLeft: "auto", transform: showPassed ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
        </button>
        {showPassed && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "6px 14px", padding: "0 15px 14px", borderTop: `1px solid ${UI.line2}`, paddingTop: 12 }}>
            {passedList.map((pn) => (
              <span key={pn} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: TYPE.label, color: UI.ink2 }}>
                <Check size={11} style={{ color: HP.ok, flexShrink: 0 }} />{pn}
              </span>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}

// ── 비용 /cost (5.10 — costModel 단일 소스, 홈 W7과 같은 숫자) ──
export function CostSurface({ onOpenRef }: { onOpenRef: (kind: string, name: string) => void }) {
  const c = useMemo(() => costModel(), []);
  const pods = useMemo(() => podInventory(), []);
  const bySvc = useMemo(() => {
    const m = new Map<string, number>();
    pods.forEach((p) => m.set(p.svc, (m.get(p.svc) || 0) + p.cpu));
    const totCpu = [...m.values()].reduce((s, v) => s + v, 0) || 1;
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([svc, v]) => ({ svc, usd: Math.round((v / totCpu) * c.total) }));
  }, [pods, c]);
  const cols: [string, string][] = [["노드", "minmax(150px,1.4fr)"], ["인스턴스", "minmax(100px,0.9fr)"], ["클러스터", "minmax(90px,0.8fr)"], ["파드", "56px"], ["월 비용", "90px"]];
  return (
    <Page title="비용" icon={Coins}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14 }}>
        <Card><KpiValue value={`$${c.total.toLocaleString()}`} delta={c.delta} deltaTone="warn" summary={<>지난달보다 <b style={{ color: TINT.warn.fg }}>${c.diff}</b> 증가 — 노드 {c.rows.length}대 · 스팟 절감 ${c.spotSave}</>} /></Card>
        <Card>
          <div style={{ fontSize: TYPE.label, fontWeight: 700, color: UI.ink3, marginBottom: 8 }}>월별 추이</div>
          <MiniBars values={c.monthly} labels={c.labels} currentIndex={c.monthly.length - 1} tone={HP.warn} />
        </Card>
        <Card>
          <div style={{ fontSize: TYPE.label, fontWeight: 700, color: UI.ink3, marginBottom: 8 }}>서비스별 상위 소비</div>
          <RankList rows={bySvc.map((s) => ({ id: s.svc, tone: "ok" as const, title: s.svc, right: `$${s.usd}` }))} onPick={(id) => onOpenRef("Service", id)} />
        </Card>
      </div>
      <Card pad={0}>
        <THead cols={cols} />
        {c.rows.map((n, i) => (
          <TRow key={n.id} cols={cols} i={i} onClick={() => onOpenRef("Node", n.id)} cells={[
            <span key="n" style={{ display: "flex", alignItems: "center", gap: 8 }}><Server size={13} style={{ color: UI.ink3, flexShrink: 0 }} /><Mono>{n.id}</Mono></span>,
            <Mono key="i" dim>{n.instance}</Mono>,
            <Mono key="c" dim>{n.cluster}</Mono>,
            <Mono key="p">{n.podCount}</Mono>,
            <Mono key="m">${n.monthly}</Mono>,
          ]} />
        ))}
      </Card>
    </Page>
  );
}

// ── 설정 /settings (D20 — 전역 앱 설정만. 연결·클러스터 관리는 각자의 문맥에) ──
export function SettingsSurface() {
  const [noise, setNoise] = useState(() => { try { return sessionStorage.getItem("opsia-demo-toast-crit-only") === "1"; } catch { return false; } });
  const toggleNoise = () => setNoise((v) => { const n = !v; try { sessionStorage.setItem("opsia-demo-toast-crit-only", n ? "1" : "0"); } catch { /* 데모 */ } return n; });
  return (
    <Page title="설정" icon={Building2}>
      <Card pad={0}>
        <SettingsRow icon={Building2} title="워크스페이스" sub="jungle-303 · 멤버 4" right={<Mono dim>owner</Mono>} />
        <SettingsRow icon={Globe} title="언어" sub="인터페이스 표시 언어" right={<Mono>한국어</Mono>} />
        <SettingsRow icon={Bell} title="토스트 알림" sub="장애 사건만 토스트로 표시 (벨에는 전부 기록)" right={
          <button onClick={toggleNoise} style={{ width: 34, height: 20, borderRadius: 999, border: "none", cursor: "pointer", background: noise ? HP.ok : inkA(0.15), position: "relative", transition: "background .2s" }}>
            <span style={{ position: "absolute", top: 2, left: noise ? 16 : 2, width: 16, height: 16, borderRadius: 999, background: UI.card, boxShadow: `0 1px 3px ${inkA(0.3)}`, transition: "left .2s" }} />
          </button>} />
      </Card>
      <Card pad={0}>
        <SettingsRow icon={Radio} title="Prometheus" sub="메트릭 수집 · prod-eks, dev-eks" right={<Pill tone="ok" label="연결됨" />} />
        <SettingsRow icon={AwsIcon as never} title="Amazon EKS" sub="클러스터 프로바이더 자격 증명" right={<Pill tone="ok" label="유효" />} />
        <SettingsRow icon={GithubIcon as never} title="GitHub" sub="저장소 웹훅 · Jungle-303-04" right={<Pill tone="ok" label="연결됨" />} />
      </Card>
      <span style={{ fontSize: TYPE.caption2, fontFamily: MONO, color: UI.ink3 }}>Opsia Console 0.1.0 · demo</span>
    </Page>
  );
}

// ── 배포 > 워크플로우 — GitOps 배포 파이프라인 정의(원형: archive/codex/gitOpsNode 블루프린트) ──
// 노드 클릭 = 해당 단계 설정이 열린다(다이나믹 편집). 단계 추가·삭제·설정 변경·저장 전부 실동작.
type Wf = { id: string; name: string; repo: string; trigger: string; steps: string[]; cfg: Record<string, string>; last?: string };
const WF_PRESETS = ["게이트 검증", "승인 대기", "카나리", "알림 발송"];
// 단계별 설정 스키마 — 키: 단계명, 값: [필드라벨, 옵션들] (옵션 1개 = 자유 입력)
const STEP_FIELDS: Record<string, [string, string[]][]> = {
  "소스": [["브랜치", ["main", "release/*", "dev"]], ["트리거", ["push", "tag", "수동"]]],
  "게이트 검증": [["기준", ["전체 게이트 통과", "필수 게이트만", "경고 허용"]], ["시간 상한", ["10분", "20분", "30분"]]],
  "승인 대기": [["승인자", ["플랫폼 팀", "서비스 오너", "온콜"]], ["만료", ["1시간", "4시간", "24시간"]]],
  "카나리": [["비율", ["10%", "25%", "50%"]], ["관찰 시간", ["5분", "15분", "30분"]]],
  "알림 발송": [["채널", ["Slack #deploy", "Slack #oncall", "Email"]]],
  "배포": [["전략", ["RollingUpdate", "Recreate", "Blue/Green"]], ["실패 시", ["자동 롤백", "중단 후 대기"]]],
};
function WfNode({ label, edge, active, onClick }: { label: string; edge: boolean; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: TYPE.label, fontWeight: 600, cursor: "pointer",
        color: active ? UI.card : edge ? TINT.blue.fg : UI.ink,
        background: active ? BLUE : edge ? TINT.blue.bg : UI.bg2,
        border: `1px solid ${active ? BLUE : edge ? TINT.blue.bd : UI.line}`,
        borderRadius: 8, padding: "5px 11px", whiteSpace: "nowrap", transition: "background .15s, color .15s" }}>
      {label}
    </button>
  );
}
function WfCard({ wf, onChange, onSave, onCancel, isDraft, repos }: {
  wf: Wf; onChange: (w: Wf) => void; onSave?: () => void; onCancel?: () => void; isDraft?: boolean; repos: string[];
}) {
  const [selStep, setSelStep] = useState<number | null>(null);
  const step = selStep !== null ? wf.steps[selStep] : null;
  const fields = step ? (STEP_FIELDS[step] ?? []) : [];
  const cfgKey = (f: string) => `${selStep}:${step}:${f}`;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <GitBranch size={14} style={{ color: TINT.blue.fg }} />
        {isDraft
          ? <input value={wf.name} onChange={(e) => onChange({ ...wf, name: e.target.value })}
              style={{ border: "none", outline: "none", background: UI.bg2, borderRadius: 7, padding: "4px 9px", fontSize: TYPE.body, fontWeight: 700, color: UI.ink, width: 180 }} />
          : <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink }}>{wf.name}</span>}
        {isDraft
          ? <select value={wf.repo} onChange={(e) => onChange({ ...wf, repo: e.target.value })}
              style={{ border: `1px solid ${UI.line}`, borderRadius: 7, padding: "4px 8px", fontSize: TYPE.label, color: UI.ink2, background: UI.card }}>
              {repos.map((r) => <option key={r}>{r}</option>)}
            </select>
          : <Mono dim>{wf.repo}</Mono>}
        <span style={{ fontSize: TYPE.caption2, color: UI.ink3 }}>{wf.trigger}</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
          {wf.last && !isDraft && <Pill tone="ok" label={wf.last} />}
          {isDraft && <>
            <button onClick={onCancel} style={{ border: `1px solid ${UI.line}`, background: UI.card, color: UI.ink2, borderRadius: 8, padding: "5px 13px", fontSize: TYPE.label, fontWeight: 700, cursor: "pointer" }}>취소</button>
            <button onClick={onSave} style={{ border: "none", background: BLUE, color: UI.card, borderRadius: 8, padding: "5px 13px", fontSize: TYPE.label, fontWeight: 700, cursor: "pointer" }}>저장</button>
          </>}
        </span>
      </div>
      {/* 파이프라인 — 노드 클릭 = 설정 열기 */}
      <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {wf.steps.map((st, i) => (
          <span key={`${st}-${i}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <WfNode label={st} edge={i === 0 || i === wf.steps.length - 1} active={selStep === i} onClick={() => setSelStep(selStep === i ? null : i)} />
            {i < wf.steps.length - 1 && <ArrowRight size={12} style={{ color: UI.ink3, flexShrink: 0 }} />}
          </span>
        ))}
      </span>
      {/* 선택 노드 설정 — 다이나믹 확장 */}
      {step && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}
          style={{ marginTop: 11, border: `1px solid ${TINT.blue.bd}`, background: blueA(0.04), borderRadius: 10, padding: "11px 13px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: TYPE.label, fontWeight: 700, color: TINT.blue.fg }}>{step} 설정</span>
          {fields.map(([f, opts]) => (
            <label key={f} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: TYPE.label, color: UI.ink2 }}>
              {f}
              <select value={wf.cfg[cfgKey(f)] ?? opts[0]}
                onChange={(e) => onChange({ ...wf, cfg: { ...wf.cfg, [cfgKey(f)]: e.target.value } })}
                style={{ border: `1px solid ${UI.line}`, borderRadius: 7, padding: "3px 8px", fontSize: TYPE.label, color: UI.ink, background: UI.card }}>
                {opts.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
          ))}
          {selStep !== null && selStep > 0 && selStep < wf.steps.length - 1 && (
            <button onClick={() => { onChange({ ...wf, steps: wf.steps.filter((_, j) => j !== selStep) }); setSelStep(null); }}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, border: "none", background: critA(0.09), color: TINT.crit.fg, borderRadius: 7, padding: "4px 10px", fontSize: TYPE.label, fontWeight: 700, cursor: "pointer" }}>
              <X size={11} />단계 제거
            </button>
          )}
        </motion.div>
      )}
      {/* 단계 추가 — 소스와 배포 사이에 삽입 */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
        <span style={{ fontSize: TYPE.caption2, fontWeight: 700, color: UI.ink3 }}>단계 추가</span>
        {WF_PRESETS.filter((pz) => !wf.steps.includes(pz)).map((pz) => (
          <button key={pz} onClick={() => onChange({ ...wf, steps: [...wf.steps.slice(0, -1), pz, wf.steps[wf.steps.length - 1]] })}
            style={{ border: `1px dashed ${UI.line}`, background: "transparent", color: UI.ink2, borderRadius: 999, padding: "3px 11px", fontSize: TYPE.label, fontWeight: 600, cursor: "pointer" }}>+ {pz}</button>
        ))}
      </div>
    </Card>
  );
}
function WorkflowsTab({ repos }: { repos: string[] }) {
  const [wfs, setWfs] = useState<Wf[]>([
    { id: "wf-main", name: "main 자동 배포", repo: repos[0] ?? "Jungle-303-04/final", trigger: "push → main", steps: ["소스", "게이트 검증", "배포"], cfg: {}, last: "44분 전 · 성공" },
  ]);
  const [draft, setDraft] = useState<Wf | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {wfs.map((w) => (
        <WfCard key={w.id} wf={w} repos={repos} onChange={(nw) => setWfs(wfs.map((x) => x.id === w.id ? nw : x))} />
      ))}
      {draft ? (
        <WfCard wf={draft} repos={repos} isDraft onChange={setDraft}
          onSave={() => { setWfs([...wfs, draft]); setDraft(null); }} onCancel={() => setDraft(null)} />
      ) : (
        <button onClick={() => setDraft({ id: `wf-${Date.now()}`, name: "새 워크플로우", repo: repos[0] ?? "", trigger: "push → main", steps: ["소스", "배포"], cfg: {} })}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52, border: `1.5px dashed ${UI.line}`, borderRadius: 14, background: "transparent", cursor: "pointer", fontSize: TYPE.label2, fontWeight: 700, color: BLUE }}>
          + 새 워크플로우
        </button>
      )}
    </div>
  );
}

// ── 알림 /alerts — 벨 팝오버의 "전체 보기" 목적지: 진행 중 + 최근 내역(타임라인과 같은 단일 소스) ──
export function AlertsSurface({ onOpenRef }: { onOpenRef: (kind: string, name: string) => void }) {
  const items = timelineItems();
  const cols: [string, string][] = [["상태", "88px"], ["내용", "minmax(240px,1.8fr)"], ["분류", "minmax(70px,0.5fr)"], ["시간", "minmax(70px,0.5fr)"]];
  return (
    <Page title="알림" icon={Bell}>
      <ChipRow chips={[
        { label: "진행 중", value: 1 },
        { label: "최근", value: items.length },
        { label: "장애", value: items.filter((x) => x.tone === "crit").length, crit: items.some((x) => x.tone === "crit") },
      ]} />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="pulsedot" style={{ width: 7, height: 7, borderRadius: 999, background: BLUE, flexShrink: 0 }} />
          <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink }}>dev-eks 배포 진행 중</span>
          <Mono dim>Jungle-303-04/final · 3/5 단계</Mono>
          <span style={{ marginLeft: "auto", width: 160, height: 6, borderRadius: 999, background: UI.line2, overflow: "hidden" }}>
            <motion.span initial={{ width: 0 }} animate={{ width: "60%" }} transition={{ duration: DUR.meter, ease: "easeInOut" }} style={{ display: "block", height: "100%", background: BLUE, borderRadius: 999 }} />
          </span>
        </div>
      </Card>
      <Card pad={0}>
        <THead cols={cols} />
        {items.map((n, i) => (
          <TRow key={n.id} cols={cols} i={i} onClick={n.ref ? () => onOpenRef(n.ref!.kind, n.ref!.name) : undefined} cells={[
            <Pill key="s" tone={n.tone === "crit" ? "crit" : n.tone === "warn" ? "warn" : "ok"} label={n.tone === "crit" ? "장애" : n.tone === "warn" ? "주의" : "정상"} />,
            <span key="t" style={{ fontSize: TYPE.label2, color: UI.ink }}>{n.title}</span>,
            <span key="c" style={{ fontSize: TYPE.label, color: UI.ink3 }}>{n.cat}</span>,
            <Mono key="w" dim>{n.time}</Mono>,
          ]} />
        ))}
      </Card>
    </Page>
  );
}

// ── AI 대화 /ai — AI 패널 대화 내역 모아보기(행 클릭·새 대화 = 패널 열기, 죽은 컨트롤 없음) ──
const AI_HISTORY = [
  { id: "c1", title: "redis-605 OOMKilled 원인 분석", preview: "메모리 한도 512Mi 대비 워킹셋이 반복 초과… 한도 상향 또는 캐시 TTL 조정 제안", ctx: "이슈", time: "10분 전" },
  { id: "c2", title: "shop-api 배포 워크플로우 구성", preview: "게이트 검증 단계를 소스와 배포 사이에 추가하는 구성을 안내", ctx: "배포", time: "2시간 전" },
  { id: "c3", title: "prod-eks 비용 증가 원인", preview: "지난달 대비 +4.2%는 노드 그룹 확장 영향 — 스팟 비중 상향 검토 제안", ctx: "비용", time: "어제" },
];
export function AiHistorySurface({ onOpenPanel }: { onOpenPanel: () => void }) {
  const cols: [string, string][] = [["대화", "minmax(260px,2fr)"], ["컨텍스트", "minmax(70px,0.5fr)"], ["시간", "minmax(70px,0.5fr)"]];
  return (
    <Page title="AI 대화" icon={Sparkles}
      action={<button onClick={onOpenPanel} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: BLUE, color: UI.card, borderRadius: 9, padding: "6px 13px", fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>새 대화</button>}>
      <Card pad={0}>
        <THead cols={cols} />
        {AI_HISTORY.map((c, i) => (
          <TRow key={c.id} cols={cols} i={i} onClick={onOpenPanel} cells={[
            <span key="t" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: TYPE.label2, fontWeight: 700, color: UI.ink }}>{c.title}</span>
              <span style={{ fontSize: TYPE.label, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.preview}</span>
            </span>,
            <Pill key="c" tone="info" label={c.ctx} />,
            <Mono key="w" dim>{c.time}</Mono>,
          ]} />
        ))}
      </Card>
    </Page>
  );
}
